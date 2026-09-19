import { GoogleGenAI } from "@google/genai";

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const chunks = [];

    for await (const chunk of req) {
      chunks.push(chunk);
    }

    const videoBuffer = Buffer.concat(chunks);

    if (!videoBuffer.length) {
      return res.status(400).json({ error: "No video received" });
    }

    const mimeType = req.headers["content-type"] || "video/mp4";

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    // Upload video to Gemini
    let video = await ai.files.upload({
      file: new Blob([videoBuffer], { type: mimeType }),
      config: {
        mimeType,
      },
    });

    // Wait until Gemini finishes processing the video
    while (video.state?.toString() !== "ACTIVE") {
      if (video.state?.toString() === "FAILED") {
        throw new Error("Gemini video processing failed");
      }

      await new Promise(resolve => setTimeout(resolve, 3000));

      video = await ai.files.get({
        name: video.name,
      });
    }

    // Analyze the video
    const response = await ai.models.generateContent({
      model: "gemini-3.8-flash",
      contents: [
        {
          role: "user",
          parts: [
            {
              fileData: {
                fileUri: video.uri,
                mimeType: video.mimeType,
              },
            },
            {
              text: `Analyze this video as a YouTube pre-upload safety check.

Give a clear, concise report with:
1. Overall risk level: Low, Medium, or High
2. Potentially problematic content
3. Which type of YouTube policy area may be relevant
4. What could be changed before uploading
5. Important uncertainty or limitations

Do not claim that YouTube will definitely remove, restrict, or strike the video. This is only an AI-based pre-check.`,
            },
          ],
        },
      ],
    });

    return res.status(200).json({
      analysis: response.text || "No analysis was returned.",
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: error.message || "Server error",
    });
  }
}

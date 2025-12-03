import { GoogleGenerativeAI } from '@google/generative-ai'

export interface CheckResult {
    isCorrect: boolean
    explanation: string
}

export async function checkAnswer(
    apiKey: string,
    japanese: string,
    correctEnglish: string,
    userEnglish: string
): Promise<CheckResult> {
    if (!apiKey) {
        throw new Error('API Key is missing')
    }

    const genAI = new GoogleGenerativeAI(apiKey)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' })

    const prompt = `
    You are an English teacher.
    A student translated the Japanese sentence "${japanese}" into English as "${userEnglish}".
    The expected correct answer was "${correctEnglish}".

    Is the student's translation semantically correct and natural?
    Even if it doesn't match the expected answer exactly, if it conveys the same meaning and is grammatically correct, mark it as correct.

    Reply ONLY with a valid JSON object in the following format:
    {
      "isCorrect": boolean,
      "explanation": "string (Explain why it is correct or incorrect in Japanese, briefly)"
    }
  `

    try {
        const result = await model.generateContent(prompt)
        const response = await result.response
        const text = response.text()

        // Clean up markdown code blocks if present
        const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim()

        return JSON.parse(jsonStr) as CheckResult
    } catch (error) {
        console.error('Gemini API Error:', error)
        return {
            isCorrect: false,
            explanation: 'AI判定中にエラーが発生しました。'
        }
    }
}

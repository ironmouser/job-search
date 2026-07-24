import { GoogleGenerativeAI } from '@google/generative-ai';

async function main() {
    const key = process.env.GEMINI_API_KEY;
    console.log(`Gemini API key present: ${!!key}`);
    if (!key) return;

    const genAI = new GoogleGenerativeAI(key);

    const modelsToTest = ['gemini-3.1-flash-lite', 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-flash'];

    for (const modelName of modelsToTest) {
        try {
            console.log(`Testing model "${modelName}"...`);
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hello, reply with 'OK'");
            console.log(`  SUCCESS [${modelName}]: ${result.response.text().trim()}`);
        } catch (e: any) {
            console.log(`  FAILED [${modelName}]: ${e.message}`);
        }
    }
}

main();

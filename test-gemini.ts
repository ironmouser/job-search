import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';
dotenv.config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');
async function run() {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const res = await model.generateContent("hello");
    console.log("Success 1.5:", res.response.text());
  } catch (e: any) {
    console.error("Error 1.5:", e.message);
  }
  try {
    const model2 = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const res2 = await model2.generateContent("hello");
    console.log("Success 2.5:", res2.response.text());
  } catch (e: any) {
    console.error("Error 2.5:", e.message);
  }
}
run();

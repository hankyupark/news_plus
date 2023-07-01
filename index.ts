import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import * as dotenv from 'dotenv';
import { Readability } from '@mozilla/readability';
import { JSDOM } from 'jsdom';

dotenv.config();

// Coindesk RSS 피드 가져오기
async function fetchCoindeskRssFeed(): Promise<any> {
  const rssUrl = 'https://www.coindesk.com/arc/outboundfeeds/rss/';

  const response = await axios.get(rssUrl);
  return response.data;
}

// XML을 JSON으로 변환하기
async function convertXmlToJson(xmlData: string): Promise<any> {
  const jsonData = await parseStringPromise(xmlData);
  return jsonData;
}

// Readability를 사용하여 텍스트 요약하기
async function extractContentFromUrl(url: string): Promise<string> {
  const response = await axios.get(url);
  // console.dir(response.data)

  const doc = new JSDOM(response.data)
  const reader = new Readability(doc.window.document)
  const article = reader.parse()
  // console.log(`url:${url}, article: ${JSON.stringify(article)}`)
  return article.textContent;
}

// ChatGPT API를 사용하여 텍스트 요약하기
async function summarizeText(text: string): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  const apiUrl = 'https://api.openai.com/v1/chat/completions';

  const responseEnglish = await axios.post(
    apiUrl,
    {
      model: 'gpt-3.5-turbo',
      // max_tokens: 300,
      temperature: 0.7,
      top_p: 0.5,
      messages: [
        {
          "role": "system",
          "content": "You are a helpful assistant for text summarization.",
         },
        { role: 'user', content: `Summarize the text delimited by trible single dotes and use bullet points for each sentence. '''${text}'''` },
      ],
      
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );
  const english = responseEnglish.data.choices[0].message.content;
  console.log(`english: ${english}`)

  const responseKorean = await axios.post(
    apiUrl,
    {
      model: 'gpt-3.5-turbo',
      // max_tokens: 300,
      temperature: 0.7,
      top_p: 0.5,
      messages: [
        {
          "role": "system",
          "content": "You are a helpful assistant for text summarization.",
         },
        { role: 'user', content: `Translate the text delimited by triple single quotes into Korean. '''${english}'''` },
      ],
      
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    }
  );
  let korean = responseKorean.data.choices[0].message.content;
  // remove the starting and ending triple single quotes using regular expression
  korean = korean.replace(/^'''|'''$/g, '');
  console.log(`korean: ${korean}`);
  
  return { english, korean };
}

async function sendToSlack(title: string, summary: any, link: string) {
  const webhookUrl = process.env.SLACK_WEBHOOK_URL;
  const response = await axios.post(
    webhookUrl,
    {
      text: `<${link}|${title}>\n\n${summary.korean}\n\n${summary.english}`,
    },
    {
      headers: {
        'Content-Type': 'application/json',
      },
    }
  );
  console.log('Slack response:', response.data);
}

// 메인 함수
async function main() {
  try {
    // Coindesk RSS 피드 가져오기
    const rssData = await fetchCoindeskRssFeed();
 
    // XML을 JSON으로 변환
    const rssJson = await convertXmlToJson(rssData);

    const newsItems = rssJson.rss.channel[0].item;
        
    // 각 뉴스 요약
    for (const item of newsItems.slice(0, 10)) {
      console.log('News Title:', item.title);

      // Readability를 사용하여 텍스트 요약
      const content = await extractContentFromUrl(item.link)
      // console.log(`content: ${JSON.stringify(content)}`);

      const summary = await summarizeText(content);
      // console.log('News Summary:', summary.korean);

      await sendToSlack(item.title, summary, item.link);
      // break;
    }
  } catch (error) {
    console.error('An error occurred:', error);
  }
}

main();

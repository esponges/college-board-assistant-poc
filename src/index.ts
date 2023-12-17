import OpenAI from "openai";
import dotenv from "dotenv";
import readline from "readline";
import {
  EXAMPLES,
  formatQuestionForReadline,
  formattedHelpPrompts,
} from "./examples.ts";
dotenv.config();
readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Create a OpenAI connection
const secretKey = process.env.OPENAI_API_KEY;
const openai = new OpenAI({
  apiKey: secretKey,
});

async function askRLineQuestion(question: string) {
  return new Promise<string>((resolve, _reject) => {
    rl.question(question, (answer: string) => {
      resolve(`${answer}\n`);
    });
  });
}

// initial reference for implementation (in Pytho)
// https://github.com/openai/openai-cookbook/blob/main/examples/Assistants_API_overview_python.ipynb
async function displayQuiz(title: string, questions: Record<string, string>[]) {
  console.log("Quiz :\n", title);
  const responses = [];

  for (const question of questions) {
    let response = "";

    // if multiple choice, print options
    if (question["question_type"] === "MULTIPLE_CHOICE") {
      const rLineQn = `Question: ${question["question_text"]}\n
      Options: ${question["choices"]}\n
      `;

      response = await askRLineQuestion(rLineQn);
    } else if (question["question_type"] === "FREE_RESPONSE") {
      const rLineQn = `Question: ${question["question_text"]}\n
      `;

      response = await askRLineQuestion(rLineQn);
    }

    responses.push(response);
  }
  console.log("Your responses from the quiz :\n", responses);
  return responses;
}

// const quizJson = {
//   name: "display_quiz",
//   description:
//     "Displays a quiz to the student, and returns the student's response. A single quiz can have multiple questions.",
//   parameters: {
//     type: "object",
//     properties: {
//       title: { type: "string" },
//       questions: {
//         type: "array",
//         description:
//           "An array of questions, each with a title and potentially options (if multiple choice).",
//         items: {
//           type: "object",
//           properties: {
//             question_text: { type: "string" },
//             question_type: {
//               type: "string",
//               enum: ["MULTIPLE_CHOICE", "FREE_RESPONSE"],
//             },
//             choices: { type: "array", items: { type: "string" } },
//           },
//           required: ["question_text"],
//         },
//       },
//     },
//     required: ["title", "questions"],
//   },
// };

let isQuizAnswered = false;

async function main() {
  try {
    const assistant = await openai.beta.assistants.retrieve(process.env.ASSISTANT_ID || "");

    // Log the first greeting
    console.log(
      "\nHola, soy tu asistente personal para ayudarte a pasar el examen de admisión a la universidad.\n"
    );

    // Create a thread
    const thread = await openai.beta.threads.create();

    // Use keepAsking as state for keep asking questions
    let keepAsking = true;

    while (keepAsking) {
      const qn = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];
      const context = formatQuestionForReadline(
        qn.questions[0].text,
        qn.questions[0].choices,
        qn.context
      );
      const userQuestion = isQuizAnswered
        ? await askRLineQuestion("You next question to the model: \n")
        : // this will make the model  build a quiz using our provided function
          await askRLineQuestion(
            `El quiz: \n${context}\n
            Elige la ayuda que necesitas: \n
            ${formattedHelpPrompts.join("")}`
          );

      // Pass in the user question into the existing thread
      await openai.beta.threads.messages.create(thread.id, {
        role: "user",
        content: userQuestion,
      });

      // Use runs to wait for the assistant response and then retrieve it
      const run = await openai.beta.threads.runs.create(thread.id, {
        assistant_id: assistant.id,
      });

      let actualRun = await openai.beta.threads.runs.retrieve(
        thread.id,
        run.id
      );

      // Polling mechanism to see if actualRun is completed
      // This should be made more robust.
      while (
        actualRun.status === "queued" ||
        actualRun.status === "in_progress" ||
        actualRun.status === "requires_action"
      ) {
        // requires_action means that the assistant is waiting for the functions to be added
        if (actualRun.status === "requires_action") {
          // extra single tool call
          const toolCall =
            actualRun.required_action?.submit_tool_outputs?.tool_calls[0];

          const name = toolCall?.function.name;

          const args = JSON.parse(toolCall?.function?.arguments || "{}");
          const questions = args.questions;

          const responses = await displayQuiz(name || "cool quiz", questions);

          // toggle flag that sets initial quiz
          isQuizAnswered = true;

          // we must submit the tool outputs to the run to continue
          await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
            tool_outputs: [
              {
                tool_call_id: toolCall?.id,
                output: JSON.stringify(responses),
              },
            ],
          });
        }
        // keep polling until the run is completed
        await new Promise((resolve) => setTimeout(resolve, 2000));
        actualRun = await openai.beta.threads.runs.retrieve(thread.id, run.id);
      }

      // Get the last assistant message from the messages array
      const messages = await openai.beta.threads.messages.list(thread.id);

      // Find the last message for the current run
      const lastMessageForRun = messages.data
        .filter(
          (message) => message.run_id === run.id && message.role === "assistant"
        )
        .pop();

      // If an assistant message is found, console.log() it
      if (lastMessageForRun) {
        // aparently this is not correctly typed
        // content returns an of objects do contain a text object
        const messageValue = lastMessageForRun.content[0] as {
          text: { value: string };
        };

        console.log(`${messageValue?.text?.value} \n`);
      }

      // Then ask if the user wants to ask another question and update keepAsking state
      const continueAsking = await askRLineQuestion(
        "Do you want to keep having a conversation? (yes/no) "
      );

      keepAsking = continueAsking.toLowerCase() === "yes";

      // If the keepAsking state is falsy show an ending message
      if (!keepAsking) {
        console.log("Alrighty then, I hope you learned something!\n");
      }
    }

    // close the readline
    rl.close();
  } catch (error) {
    console.error(error);
  }
}

// Call the main function
main();

export {};

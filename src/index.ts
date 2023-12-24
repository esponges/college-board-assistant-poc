import OpenAI from "openai";
import dotenv from "dotenv";
import readline from "readline";
import {
  EXAMPLES,
  formattedHelpPrompts,
  logQuestionsForReadLine,
} from "./examples.ts";
dotenv.config();
import chalk from "chalk";

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

// initial reference for implementation (in Python)
// https://github.com/openai/openai-cookbook/blob/main/examples/Assistants_API_overview_python.ipynb
// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

const isQuizAnswered = false;

async function main() {
  try {
    const assistant = await openai.beta.assistants.retrieve(
      process.env.ASSISTANT_ID || ""
    );

    // Log the first greeting
    console.log(
      chalk.greenBright(
        "\nHola, soy tu asistente personal para ayudarte a pasar el examen de admisión a la universidad.\n"
      )
    );

    // Use keepAsking as state for keep asking questions
    let keepAsking = true;

    while (keepAsking) {
      const qn = EXAMPLES[Math.floor(Math.random() * EXAMPLES.length)];
      const context = logQuestionsForReadLine(
        qn.questions[0].text,
        qn.questions[0].choices,
        qn.context
      );

      const helpOptChosen = await askRLineQuestion(`
      Elige usando los números la ayuda que necesitas: \n
      ${formattedHelpPrompts.join("")}`);

      const opts = [];
      for (let i = 1; i <= formattedHelpPrompts.length; i++) {
        opts.push(i.toString());
      }

      const chosenOpt = parseInt(helpOptChosen, 10);

      if (!opts.includes(helpOptChosen.trim()[0])) {
        console.log(chalk.greenBright("Pregunta abierta al asistente \n"));
      } else if (chosenOpt < 1 || chosenOpt > opts.length) {
        console.log(
          chalk.red("Opción inválida - sólo usa números por favor: \n")
        );
        continue;
      }

      const userQuestion = isQuizAnswered
        ? await askRLineQuestion(
            chalk.greenBright("Tu siguiente pregunta al asistente: \n")
          )
        : // this will make the model  build a quiz using our provided function
          `Contexto: \n ${context} \n
            ${formattedHelpPrompts[chosenOpt - 1]} \n
            `;

      // Create a thread
      const thread = await openai.beta.threads.create();

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
        // TODO: We'll certainly need to add functions to the assistant
        if (actualRun.status === "requires_action") {
          // extra single tool call
          const toolCall =
            actualRun.required_action?.submit_tool_outputs?.tool_calls[0];

          const name = toolCall?.function.name;
          console.log(`\n$Method to be called: ${name}\n`);
          const args = JSON.parse(toolCall?.function?.arguments || "{}");
          console.log("\n$Arguments for the function: \n", args);

          const response = { success: true, error: null, result: null };

          // we must submit the tool outputs to the run to continue
          await openai.beta.threads.runs.submitToolOutputs(thread.id, run.id, {
            tool_outputs: [
              {
                tool_call_id: toolCall?.id,
                output: JSON.stringify(response),
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
        "¿Deseas continuar con la conversación? (s/n) "
      );

      keepAsking = continueAsking.toLowerCase().startsWith("s");

      // If the keepAsking state is falsy show an ending message
      if (!keepAsking) {
        console.log("Okay, ¡espero que hayas aprendido algo!\n");
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

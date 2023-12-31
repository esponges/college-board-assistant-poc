/* eslint-disable @typescript-eslint/no-unused-vars */
/* 
  FUNCTION CALLING

  The following schemas describe the parameters that are passed to the functions
  These parameters will be provided by the model and we are responsible for handling them
  and returning the correct response to the model which will process and return the response to the student

  The flow of the program is as follows:
  1. The student asks a question
  2. The model receives the question and figures out what to do with it, it will either:
    - Answer the question directly
    - Return an object with the pamarameters and the name of the function that will handle the parameters
    - We will then call the function with the parameters and return the response to the model with the `submitToolOutputs` function
    - We will then receive a second with a response regarding what we returned to the model
*/

const quizJson = {
  name: "display_quiz",
  description:
    "Displays a quiz to the student, and returns the student's response. A single quiz can have multiple questions.",
  parameters: {
    type: "object",
    properties: {
      title: { type: "string" },
      questions: {
        type: "array",
        description:
          "An array of questions, each with a title and potentially options (if multiple choice).",
        items: {
          type: "object",
          properties: {
            question_text: { type: "string" },
            question_type: {
              type: "string",
              enum: ["MULTIPLE_CHOICE", "FREE_RESPONSE"],
            },
            choices: { type: "array", items: { type: "string" } },
          },
          required: ["question_text"],
        },
      },
    },
    required: ["title", "questions"],
  },
};

// a function where the student doesn't understand the question
// and would like to get an explanation with a different wording

// when this function is call we know that the student doesn't understand the question
// therefore we should provide the model with clear instructions on how to explain the question

const differentWordings = {
  "name": "different_wording",
  "description":
    "Provides a step-by-step explanation of the question with a different wording.",
  "parameters": {
    "type": "object",
    "properties": {
      "question_text": { "type": "string" },
      "choices": { "type": "array", "items": { "type": "string" } },
    },
    "required": ["question_text"],
  },
};

// a function where the student asks for a hint for the question

const getHint = {
  "name": "get_hint",
  "description":
    "Provides a hint to the student.",
  "parameters": {
    "type": "object",
    "properties": {
      "hint": { "type": "string",
      "description": "A hint for the question" },
  },
    "required": ["hint"],
  },
};

// if the student is stuck on a question and would like to skip it

const skipQuestion = {
  "name": "skip_question",
  "description":
    "Skips the question.",
  "parameters": {
    "type": "object",
    "properties": {
      "skip": { "type": "string",
      "description": "Skips the question" },
  },
    "required": ["skip"],
  },
};

// if the student wants to get the answer to the question

const getAnswer = {
  "name": "get_answer",
  "description":
    "Provides the answer to the question.",
  "parameters": {
    "type": "object",
    "properties": {
      "answer": { "type": "string",
      "description": "The answer to the question" },
  },
    "required": ["answer"],
  },
};

// if the student wants to get the answer to the question
// but we don't want to give it to them

const dontAnswer = {
  "name": "dont_answer",
  "description":
    "Does not provide the answer to the question but provides a hint instead.",
  "parameters": {
    "type": "object",
    "properties": {
      "answer": { "type": "string",
      "description": "Does not provide the answer to the question but provides a hint instead" },
  },
    "required": ["answer"],
  },
};

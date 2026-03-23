export interface QuestionOption {
  label: string;
  description: string;
  preview?: string;
}

export interface Question {
  question: string;
  header: string;
  multiSelect: boolean;
  options: QuestionOption[];
}

export interface Annotation {
  preview?: string;
  notes?: string;
}

export interface AskUserQuestionDetails {
  questions: Question[];
  answers: Record<string, string>;
  annotations?: Record<string, Annotation>;
  error?: string;
  chatAboutThis?: boolean;
}

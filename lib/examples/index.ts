import type { ExampleDataset } from "../dataset";
import { iris } from "./iris";
import { heights } from "./heights";
import { abtest } from "./abtest";
import { returns } from "./returns";
import { exams } from "./exams";

export const EXAMPLES: ExampleDataset[] = [iris, heights, abtest, returns, exams];

export function findExample(id: string): ExampleDataset | undefined {
  return EXAMPLES.find((e) => e.id === id);
}

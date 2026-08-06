import { StringBuilder } from "@tsonic/dotnet/System.Text.js";
import { compareText, replaceText } from "../utils/strings.js";

export class SearchDocument {
  title: string;
  url: string;
  mount: string;
  text: string;

  constructor(title: string, url: string, mount: string, text: string) {
    this.title = title;
    this.url = url;
    this.mount = mount;
    this.text = text;
  }
}

const escapeJsonString = (input: string): string => {
  let value = input;
  value = replaceText(value, "\\", "\\\\");
  value = replaceText(value, "\"", "\\\"");
  value = replaceText(value, "\r", "\\r");
  value = replaceText(value, "\n", "\\n");
  value = replaceText(value, "\t", "\\t");
  return value;
};

const compareSearchDocuments = (left: SearchDocument, right: SearchDocument): number => {
  const url = compareText(left.url, right.url);
  if (url !== 0) return url;
  const mount = compareText(left.mount, right.mount);
  return mount !== 0 ? mount : compareText(left.title, right.title);
};

export const renderSearchIndexJson = (documents: SearchDocument[]): string => {
  const ordered: SearchDocument[] = [];
  for (let index = 0; index < documents.length; index++) ordered.push(documents[index]!);
  ordered.sort((left: SearchDocument, right: SearchDocument) => compareSearchDocuments(left, right));

  const output = new StringBuilder();
  output.Append("[");
  for (let index = 0; index < ordered.length; index++) {
    const document = ordered[index]!;
    if (index > 0) output.Append(",");
    output.Append("{\"title\":\"");
    output.Append(escapeJsonString(document.title));
    output.Append("\",\"url\":\"");
    output.Append(escapeJsonString(document.url));
    output.Append("\",\"mount\":\"");
    output.Append(escapeJsonString(document.mount));
    output.Append("\",\"text\":\"");
    output.Append(escapeJsonString(document.text));
    output.Append("\"}");
  }
  output.Append("]");
  return output.ToString();
};

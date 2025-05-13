// completionProvider.js - Provides autocomplete suggestions for translation keys
const vscode = require("vscode");
const {
  findTranslationFiles,
  flattenKeys,
} = require("./utils/translationUtils");

/**
 * Provides completion items for translation keys
 */
const completionProvider = {
  async provideCompletionItems(document, position, token, context) {
    // Check if we're inside a t() call
    const linePrefix = document
      .lineAt(position)
      .text.substring(0, position.character);

    // Regex to check if we're in a t("...") call and capture the partial key
    const tFunctionMatch = linePrefix.match(/t\(["']([^"']*)$/);
    if (!tFunctionMatch) {
      return undefined;
    }

    try {
      // We're inside a t() function call, get translation keys
      const { translations } = await findTranslationFiles();

      // Get a reference language (usually English)
      const referenceLang = Object.keys(translations).includes("en")
        ? "en"
        : Object.keys(translations)[0];

      if (!translations[referenceLang]) {
        return undefined;
      }

      // Get all flattened keys
      const allKeys = flattenKeys(translations[referenceLang]);

      // Get the partial key that user has typed
      const partialKey = tFunctionMatch[1];

      // Create completion items for matching keys
      const completionItems = [];

      if (partialKey) {
        // Filter keys based on what user has typed
        const matchingKeys = allKeys.filter((entry) =>
          entry.key.startsWith(partialKey)
        );

        // Group keys by their next segment
        const keySegments = {};
        const exactMatches = [];

        matchingKeys.forEach((entry) => {
          // Handle the case where the partial key is already a complete key
          if (entry.key === partialKey) {
            exactMatches.push(entry);
            return;
          }

          // Get the next segment after the partial key
          const remainingPath = entry.key.substring(partialKey.length);
          const nextSegment = remainingPath.split(".")[1]; // Get first segment after what's typed

          if (nextSegment) {
            // Add unique segments
            const fullSegment =
              partialKey + (partialKey.endsWith(".") ? "" : ".") + nextSegment;
            keySegments[fullSegment] = true;
          } else if (remainingPath.startsWith(".")) {
            // This is a direct child of the partial path
            exactMatches.push(entry);
          }
        });

        // Add segment completions
        Object.keys(keySegments).forEach((segment) => {
          const item = new vscode.CompletionItem(
            segment,
            vscode.CompletionItemKind.Module
          );
          // Use a snippet insert to replace the entire key text
          item.insertText = new vscode.SnippetString(segment);
          // Set the range to replace the entire key text
          const startPos = position.translate(0, -partialKey.length);
          item.range = new vscode.Range(startPos, position);
          item.detail = "Translation Key Segment";
          item.command = {
            command: "editor.action.triggerSuggest",
            title: "Re-trigger completions",
          };
          completionItems.push(item);
        });

        // Add exact matches
        exactMatches.forEach((entry) => {
          const item = new vscode.CompletionItem(
            entry.key,
            vscode.CompletionItemKind.Value
          );
          // Use a snippet insert to replace the entire key text
          item.insertText = new vscode.SnippetString(entry.key);
          // Set the range to replace the entire key text
          const startPos = position.translate(0, -partialKey.length);
          item.range = new vscode.Range(startPos, position);
          item.detail = `${entry.value}`;
          item.documentation = new vscode.MarkdownString(
            `**${referenceLang}:** ${entry.value}`
          );
          completionItems.push(item);
        });
      } else {
        // No partial key, suggest all top-level segments
        const topLevelSegments = {};

        allKeys.forEach((entry) => {
          const firstSegment = entry.key.split(".")[0];
          topLevelSegments[firstSegment] = true;
        });

        Object.keys(topLevelSegments).forEach((segment) => {
          const item = new vscode.CompletionItem(
            segment,
            vscode.CompletionItemKind.Module
          );
          // For empty string, just insert the segment
          item.insertText = segment;
          item.detail = "Translation Key Segment";
          item.command = {
            command: "editor.action.triggerSuggest",
            title: "Re-trigger completions",
          };
          completionItems.push(item);
        });
      }

      return completionItems;
    } catch (error) {
      console.error("Error providing completion items:", error);
      return undefined;
    }
  },
};

module.exports = completionProvider;

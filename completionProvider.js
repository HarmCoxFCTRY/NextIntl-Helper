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

      // Normalize the partial key by removing trailing dot for comparison
      // but keep the original for range calculation
      const normalizedPartialKey = partialKey.replace(/\.$/, "");

      if (partialKey) {
        // Filter keys based on what user has typed (normalized for comparison)
        const matchingKeys = allKeys.filter(
          (entry) =>
            entry.key.startsWith(normalizedPartialKey) &&
            (entry.key.length > normalizedPartialKey.length ||
              normalizedPartialKey === "")
        );

        // Find direct children of the current path
        const currentSegments = normalizedPartialKey.split(".");
        const directChildren = new Set();
        const exactMatches = [];

        matchingKeys.forEach((entry) => {
          // Handle the case where the normalized partial key is already a complete key
          if (entry.key === normalizedPartialKey) {
            exactMatches.push(entry);
            return;
          }

          const entrySegments = entry.key.split(".");

          // If the entry is a direct child or grandchild of the current path
          if (entrySegments.length > currentSegments.length) {
            // Make sure all existing segments match
            let isMatch = true;
            for (let i = 0; i < currentSegments.length; i++) {
              if (currentSegments[i] !== entrySegments[i]) {
                isMatch = false;
                break;
              }
            }

            if (isMatch) {
              // Get the next segment
              const nextSegment = entrySegments[currentSegments.length];

              if (nextSegment) {
                // Build the segment path up to and including the next segment
                let segmentPath = "";
                for (let i = 0; i <= currentSegments.length; i++) {
                  if (i > 0) segmentPath += ".";
                  segmentPath += entrySegments[i];
                }

                directChildren.add(segmentPath);
              }
            }
          }
        });

        // Add direct children as completion items
        directChildren.forEach((segment) => {
          // Check if this segment has children (is a category)
          const hasChildren = matchingKeys.some(
            (entry) =>
              entry.key.startsWith(segment + ".") && entry.key !== segment
          );

          const item = new vscode.CompletionItem(
            segment,
            hasChildren
              ? vscode.CompletionItemKind.Module
              : vscode.CompletionItemKind.Property
          );

          // Use a snippet insert to replace the entire key text
          item.insertText = new vscode.SnippetString(segment);

          // Set the range to replace the entire key text
          const startPos = position.translate(0, -partialKey.length);
          item.range = new vscode.Range(startPos, position);

          item.detail = hasChildren
            ? "Translation Category"
            : "Translation Key";

          if (hasChildren) {
            item.command = {
              command: "editor.action.triggerSuggest",
              title: "Re-trigger completions",
            };
          }

          // If the segment has a value in the translations
          const segmentValue = allKeys.find((k) => k.key === segment)?.value;
          if (segmentValue) {
            item.documentation = new vscode.MarkdownString(
              `**${referenceLang}:** ${segmentValue}`
            );
          }

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
        const topLevelSegments = new Set();

        allKeys.forEach((entry) => {
          const firstSegment = entry.key.split(".")[0];
          topLevelSegments.add(firstSegment);
        });

        topLevelSegments.forEach((segment) => {
          // Check if this segment has children
          const hasChildren = allKeys.some(
            (entry) =>
              entry.key.startsWith(segment + ".") && entry.key !== segment
          );

          const item = new vscode.CompletionItem(
            segment,
            hasChildren
              ? vscode.CompletionItemKind.Module
              : vscode.CompletionItemKind.Property
          );

          // For empty string, just insert the segment
          item.insertText = segment;
          item.detail = hasChildren
            ? "Translation Category"
            : "Translation Key";

          if (hasChildren) {
            item.command = {
              command: "editor.action.triggerSuggest",
              title: "Re-trigger completions",
            };
          }

          // If the segment has a value in the translations
          const segmentValue = allKeys.find((k) => k.key === segment)?.value;
          if (segmentValue) {
            item.documentation = new vscode.MarkdownString(
              `**${referenceLang}:** ${segmentValue}`
            );
          }

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

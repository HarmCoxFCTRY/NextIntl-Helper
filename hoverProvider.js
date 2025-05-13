// hoverProvider.js - Provides hover information for translation keys
const vscode = require("vscode");
const {
  findTranslationFiles,
  getNestedProperty,
} = require("./utils/translationUtils");

/**
 * Hover provider for translation keys
 */
const hoverProvider = {
  async provideHover(document, position, token) {
    // Check if the hover is over a t("...") call
    const range = document.getWordRangeAtPosition(position);
    if (!range) return;

    const line = document.lineAt(position.line).text;

    // Check if we're inside a t() call
    const tCallMatch = line.match(/t\(["']([^"']+)["']\)/g);
    if (!tCallMatch) return;

    // For each t() call on this line, check if our position is within it
    for (const match of tCallMatch) {
      const startIndex = line.indexOf(match);
      if (startIndex === -1) continue;

      const endIndex = startIndex + match.length;
      const matchStartPos = new vscode.Position(position.line, startIndex);
      const matchEndPos = new vscode.Position(position.line, endIndex);

      const matchRange = new vscode.Range(matchStartPos, matchEndPos);

      if (matchRange.contains(position)) {
        // Extract the key
        const keyMatch = match.match(/t\(["']([^"']+)["']\)/);
        if (!keyMatch) continue;

        const translationKey = keyMatch[1];

        // Find translations
        try {
          const { translations, translationFilePaths } =
            await findTranslationFiles();

          // Get the translation value from the key path
          const results = {};
          const missingInLangs = [];

          for (const [lang, content] of Object.entries(translations)) {
            const value = getNestedProperty(content, translationKey);
            if (value !== undefined) {
              results[lang] = value;
            } else {
              missingInLangs.push(lang);
            }
          }

          if (Object.keys(results).length === 0) {
            // Offer to add the key to all translation files
            return new vscode.Hover(
              [
                `Translation key not found: ${translationKey}`,
                new vscode.MarkdownString(
                  `[Add to translation files](command:translationHelper.addTranslationKeyFromHover?${encodeURIComponent(
                    JSON.stringify([translationKey, translationFilePaths])
                  )})`
                ),
              ],
              matchRange
            );
          }

          // Create hover content with translations
          const markdownStrings = Object.entries(results).map(
            ([lang, value]) => `**${lang}**: ${value}`
          );

          // If there are missing translations, offer to add them
          if (missingInLangs.length > 0) {
            markdownStrings.push("");
            markdownStrings.push(`Missing in: ${missingInLangs.join(", ")}`);
            markdownStrings.push(
              new vscode.MarkdownString(
                `[Add missing translations](command:translationHelper.addMissingTranslationsFromHover?${encodeURIComponent(
                  JSON.stringify([
                    translationKey,
                    results,
                    missingInLangs,
                    translationFilePaths,
                  ])
                )})`
              )
            );
          }

          return new vscode.Hover(markdownStrings, matchRange);
        } catch (error) {
          // In case of error, show error message
          return new vscode.Hover(
            `Error getting translation: ${error.message}`,
            matchRange
          );
        }
      }
    }
  },
};

module.exports = hoverProvider;

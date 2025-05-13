// textHighlighter.js - Highlights untranslated text in components
const vscode = require("vscode");
const {
  findTranslationFiles,
  getNestedProperty,
} = require("./utils/translationUtils");

/**
 * Decorations for untranslated text
 */
let untranslatedDecorationType;

/**
 * Decorations when text exists in translation files
 */
let existingTranslationDecorationType;

/**
 * Sets up the decoration types for highlighting
 */
function setupDecorationTypes() {
  // Decoration for untranslated text (yellow highlight)
  untranslatedDecorationType = vscode.window.createTextEditorDecorationType({
    backgroundColor: "rgba(255, 255, 0, 0.3)",
    border: "1px solid rgba(255, 220, 0, 0.7)",
    borderRadius: "2px",
    overviewRulerColor: "#FFDC00",
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    cursor: "pointer",
    after: {
      contentText: " 💡",
      color: "#AA8800",
    },
  });

  // Decoration for text that exists in translation files (blue background)
  existingTranslationDecorationType =
    vscode.window.createTextEditorDecorationType({
      backgroundColor: "rgba(102, 153, 204, 0.2)",
      border: "1px solid rgba(102, 153, 204, 0.5)",
      borderRadius: "2px",
      overviewRulerColor: "#6699cc",
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      after: {
        contentText: " 🔍",
        color: "#6699cc",
      },
    });
}

/**
 * Registers the text highlighter functionality
 * @param {vscode.ExtensionContext} context - Extension context
 */
function registerTextHighlighter(context) {
  // Setup decoration types
  setupDecorationTypes();

  // Register command to highlight untranslated text
  const highlightCommand = vscode.commands.registerCommand(
    "translationHelper.highlightUntranslated",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showInformationMessage("No active editor");
        return;
      }

      await highlightUntranslatedText(editor);
    }
  );

  // Register command to translate selected text
  const translateTextCommand = vscode.commands.registerCommand(
    "translationHelper.translateText",
    async (text, range) => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;

      await translateTextAtRange(editor, text, range);
    }
  );

  // Register command to find key for text
  const findKeyForTextCommand = vscode.commands.registerCommand(
    "translationHelper.findKeyForText",
    async (text, range) => {
      await findExistingTranslationKey(text);
    }
  );

  // Register hover provider for highlighted text
  const highlightHoverProvider = vscode.languages.registerHoverProvider(
    ["javascript", "javascriptreact", "typescript", "typescriptreact"],
    {
      async provideHover(document, position, token) {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;

        // Get the range of the word or quoted string at the position
        const range = getStringRangeAtPosition(document, position);
        if (!range) return;

        const text = document.getText(range);
        const cleanText = cleanStringLiteral(text);

        // Skip if it's an empty string or just whitespace
        if (!cleanText.trim()) return;

        // Skip if it's a single character
        if (cleanText.length <= 1) return;

        // Skip if it's not a text string (e.g. a number, variable, etc.)
        if (!isLikelyTranslatableText(cleanText)) return;

        // Check if text exists in translation files
        const { existsInTranslations, translationKeys } =
          await textExistsInTranslations(cleanText);

        // Provide different hover based on whether text exists in translations
        if (existsInTranslations) {
          // Show which keys contain this text
          const keysList = translationKeys
            .map((key) => `- \`${key}\``)
            .join("\n");
          return new vscode.Hover(
            [
              "This text exists in translation files with these keys:",
              keysList,
              "",
              new vscode.MarkdownString(
                `[Use existing key](command:translationHelper.findKeyForText?${encodeURIComponent(
                  JSON.stringify([cleanText])
                )})`
              ),
            ],
            range
          );
        } else {
          // Offer to translate the text
          return new vscode.Hover(
            [
              "This text is not translated.",
              "",
              new vscode.MarkdownString(
                `[Translate this text](command:translationHelper.translateText?${encodeURIComponent(
                  JSON.stringify([cleanText, range])
                )})`
              ),
            ],
            range
          );
        }
      },
    }
  );

  // Add change active editor event to highlight untranslated text
  vscode.window.onDidChangeActiveTextEditor(
    async (editor) => {
      if (editor) {
        // Automatically highlight - always on
        await highlightUntranslatedText(editor);
      }
    },
    null,
    context.subscriptions
  );

  // Add document change event to update highlights
  vscode.workspace.onDidChangeTextDocument(
    async (event) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && event.document === editor.document) {
        // Automatically highlight - always on
        await highlightUntranslatedText(editor);
      }
    },
    null,
    context.subscriptions
  );

  // Register the commands
  context.subscriptions.push(highlightCommand);
  context.subscriptions.push(translateTextCommand);
  context.subscriptions.push(findKeyForTextCommand);
  context.subscriptions.push(highlightHoverProvider);
}

/**
 * Highlights untranslated text in the editor
 * @param {vscode.TextEditor} editor - The active text editor
 */
async function highlightUntranslatedText(editor) {
  try {
    const document = editor.document;
    if (!isJSXFile(document)) {
      return;
    }

    const text = document.getText();

    // Find all potential untranslated strings
    const untranslatedRanges = [];
    const existingTranslationRanges = [];

    // Find text between > and < (JSX text content), with improved direct approach
    const jsxTextRegex = />([^<>{]*?)</g;
    let match;

    while ((match = jsxTextRegex.exec(text)) !== null) {
      let content = match[1];

      // Skip if empty or just whitespace
      if (!content.trim()) {
        continue;
      }

      // Skip if it seems to be a translation key already (typically has format t("key"))
      if (content.includes("t(") && content.includes(")")) {
        continue;
      }

      // Trim the content but remember original position
      const leadingSpace = content.length - content.trimStart().length;
      const trailingSpace = content.length - content.trimEnd().length;
      content = content.trim();

      // Skip if the content is too short
      if (content.length <= 1) {
        continue;
      }

      // Skip if not likely translatable text
      if (!isLikelyTranslatableText(content)) {
        continue;
      }

      // Check if content exists in translations
      const { existsInTranslations } = await textExistsInTranslations(content);

      // Calculate the actual range of the content in the document
      const contentStartIndex = match.index + 1 + leadingSpace; // +1 to skip the ">"
      const contentEndIndex = contentStartIndex + content.length;

      const startPos = document.positionAt(contentStartIndex);
      const endPos = document.positionAt(contentEndIndex);
      const range = new vscode.Range(startPos, endPos);

      if (existsInTranslations) {
        existingTranslationRanges.push({ range });
      } else {
        untranslatedRanges.push({ range });
      }
    }

    // Apply decorations
    editor.setDecorations(untranslatedDecorationType, untranslatedRanges);
    editor.setDecorations(
      existingTranslationDecorationType,
      existingTranslationRanges
    );
  } catch (error) {
    console.error("Error highlighting untranslated text:", error);
  }
}

/**
 * Checks if text exists in translation files
 * @param {string} text - Text to check
 * @returns {Promise<Object>} Object with existsInTranslations flag and array of matching keys
 */
async function textExistsInTranslations(text) {
  try {
    const { translations } = await findTranslationFiles();
    const matchingKeys = [];

    // Get a reference language (usually English)
    const referenceLang = Object.keys(translations).includes("en")
      ? "en"
      : Object.keys(translations)[0];

    // Search flattened translations for this text
    const searchForValue = (obj, path = "") => {
      for (const [key, value] of Object.entries(obj)) {
        const currentPath = path ? `${path}.${key}` : key;

        if (typeof value === "string" && value.trim() === text.trim()) {
          matchingKeys.push(currentPath);
        } else if (typeof value === "object" && value !== null) {
          searchForValue(value, currentPath);
        }
      }
    };

    searchForValue(translations[referenceLang]);

    return {
      existsInTranslations: matchingKeys.length > 0,
      translationKeys: matchingKeys,
    };
  } catch (error) {
    console.error("Error checking if text exists in translations:", error);
    return { existsInTranslations: false, translationKeys: [] };
  }
}

/**
 * Translate text at specified range
 * @param {vscode.TextEditor} editor - The active text editor
 * @param {string} text - Text to translate
 * @param {vscode.Range} range - Range of the text
 */
async function translateTextAtRange(editor, text, range) {
  try {
    // Convert range from a serialized object back to a Range instance if needed
    if (!(range instanceof vscode.Range)) {
      range = new vscode.Range(
        new vscode.Position(range.start.line, range.start.character),
        new vscode.Position(range.end.line, range.end.character)
      );
    }

    // Suggest a key based on the text
    let suggestedKey = suggestTranslationKey(text);

    // Ask user for the translation key
    const key = await vscode.window.showInputBox({
      prompt: "Enter the translation key for this text",
      placeHolder: suggestedKey,
      value: suggestedKey,
    });

    if (!key) return; // User cancelled

    // Get the translation files
    const { translationFilePaths } = await findTranslationFiles();

    // Add the key to translation files
    const addCommand = "translationHelper.addTranslationKeyWithValue";

    // Call the command to add the translation key with the provided value
    await vscode.commands.executeCommand(
      addCommand,
      key,
      text,
      translationFilePaths
    );

    // Replace the text with t() call
    editor.edit((editBuilder) => {
      editBuilder.replace(range, `{t("${key}")}`);
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Error translating text: ${error.message}`);
  }
}

/**
 * Find an existing translation key for text
 * @param {string} text - The text to find a key for
 */
async function findExistingTranslationKey(text) {
  try {
    const { existsInTranslations, translationKeys } =
      await textExistsInTranslations(text);

    if (!existsInTranslations || translationKeys.length === 0) {
      vscode.window.showInformationMessage(
        "No existing translation key found for this text"
      );
      return;
    }

    // If there's only one key, use it directly
    if (translationKeys.length === 1) {
      const key = translationKeys[0];

      // Insert the key at cursor position
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        editor.edit((editBuilder) => {
          editBuilder.insert(editor.selection.active, `{t("${key}")}`);
        });
      }

      return;
    }

    // If multiple keys, let user choose
    const selectedKey = await vscode.window.showQuickPick(
      translationKeys.map((key) => ({
        label: key,
        description: `Translation key for "${text}"`,
      })),
      { placeHolder: "Select the translation key to use" }
    );

    if (selectedKey) {
      // Insert the key at cursor position
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        editor.edit((editBuilder) => {
          editBuilder.insert(
            editor.selection.active,
            `{t("${selectedKey.label}")}`
          );
        });
      }
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error finding translation key: ${error.message}`
    );
  }
}

/**
 * Suggest a translation key based on text
 * @param {string} text - Text to create key for
 * @returns {string} Suggested key
 */
function suggestTranslationKey(text) {
  // Convert to camelCase and clean up
  const cleanText = text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove special chars
    .replace(/\s+/g, "."); // Convert spaces to dots

  // Try to identify context (common patterns in UI text)
  if (/no .+ (found|entries)/i.test(text)) {
    return `timeEntry.noEntries`;
  }

  if (/add( a)? new/i.test(text)) {
    return `timeEntry.addNewEntry`;
  }

  if (/track your work/i.test(text) || /time entry/i.test(text)) {
    return `timeEntry.addNewEntryPrompt`;
  }

  if (/total/i.test(text)) {
    return `general.total`;
  }

  if (/time entries?/i.test(text)) {
    return `timeEntry.entries`;
  }

  // Default: use a shortened version of the text
  const words = cleanText.split(".");
  if (words.length > 3) {
    return `ui.${words.slice(0, 3).join(".")}`;
  }

  return `ui.${cleanText}`;
}

/**
 * Get the string range at position
 * @param {vscode.TextDocument} document - The text document
 * @param {vscode.Position} position - The position
 * @returns {vscode.Range|null} The range of the string or null
 */
function getStringRangeAtPosition(document, position) {
  const line = document.lineAt(position.line).text;

  // Check if we're in a JSX text node
  let textStart = -1;
  let textEnd = -1;
  let depth = 0;

  // Scan whole document for multiline JSX nodes that might contain our position
  const text = document.getText();
  const lines = text.split("\n");

  // Find the JSX node that contains our cursor position
  for (let i = 0; i < lines.length; i++) {
    const currentLine = lines[i];

    // Process this line character by character
    for (let j = 0; j < currentLine.length; j++) {
      const char = currentLine[j];
      const globalPos = document.offsetAt(new vscode.Position(i, j));

      if (char === "<") {
        if (currentLine.substr(j, 2) !== "</") {
          depth++;
          if (depth === 1) {
            // Beginning of a tag, find the closing '>'
            const closeTagIndex = currentLine.indexOf(">", j);
            if (closeTagIndex !== -1) {
              textStart = globalPos + (closeTagIndex - j) + 1;
            }
          }
        } else {
          // Closing tag
          depth--;
          if (depth === 0 && textStart !== -1) {
            textEnd = globalPos;

            // Check if our cursor position is within this text node
            const cursorGlobalPos = document.offsetAt(position);
            if (textStart <= cursorGlobalPos && cursorGlobalPos <= textEnd) {
              return new vscode.Range(
                document.positionAt(textStart),
                document.positionAt(textEnd)
              );
            }

            textStart = -1;
            textEnd = -1;
          }
        }
      }
    }
  }

  // Otherwise, check if we're in a quoted string
  const stringRegex = /["']([^"']+)["']/g;
  let stringMatch;
  while ((stringMatch = stringRegex.exec(line)) !== null) {
    const stringStartPos = position.line,
      stringStartChar = stringMatch.index + 1;
    const stringEndPos = position.line,
      stringEndChar = stringMatch.index + 1 + stringMatch[1].length;

    const stringRange = new vscode.Range(
      new vscode.Position(stringStartPos, stringStartChar),
      new vscode.Position(stringEndPos, stringEndChar)
    );

    if (stringRange.contains(position)) {
      return stringRange;
    }
  }

  return null;
}

/**
 * Clean up a string literal
 * @param {string} text - String to clean
 * @returns {string} Cleaned string
 */
function cleanStringLiteral(text) {
  return text.replace(/^["']|["']$/g, "").trim();
}

/**
 * Check if a file is a JSX file
 * @param {vscode.TextDocument} document - Document to check
 * @returns {boolean} True if JSX file
 */
function isJSXFile(document) {
  const filename = document.fileName.toLowerCase();
  return (
    filename.endsWith(".jsx") ||
    filename.endsWith(".tsx") ||
    filename.endsWith(".js") ||
    filename.endsWith(".ts")
  );
}

/**
 * Determines if text is likely translatable content
 * @param {string} text - Text to check
 * @returns {boolean} True if likely translatable
 */
function isLikelyTranslatableText(text) {
  // Skip common code patterns

  // Skip time formats
  if (/^(\d{1,2}:\d{2}(:\d{2})?|00:00)$/.test(text)) {
    return false;
  }

  // Skip common date formats
  if (/^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/.test(text)) {
    return false;
  }

  // Skip URLs
  if (text.startsWith("http") || text.startsWith("www.")) {
    return false;
  }

  // Skip hex colors
  if (/^#[0-9a-f]{3,8}$/i.test(text)) {
    return false;
  }

  // Skip CSS class names (with hyphens)
  if (
    /^[a-z0-9\-_\s]+$/i.test(text) &&
    text.includes("-") &&
    !text.includes(" ")
  ) {
    return false;
  }

  // Skip if it's just a single word that's a common variable or prop name
  const commonPropNames = [
    "className",
    "id",
    "key",
    "type",
    "style",
    "name",
    "value",
    "onClick",
    "onChange",
    "onSubmit",
    "src",
    "href",
    "alt",
  ];

  if (commonPropNames.includes(text.trim())) {
    return false;
  }

  // Skip content that looks like JSX, not text
  if (text.includes("<") || text.includes("{") || text.includes("}")) {
    return false;
  }

  // Always consider UI text patterns as translatable
  if (
    /^no\s+\w+/i.test(text) || // "No time entries", etc.
    /^add\s+a\s+\w+/i.test(text) || // "Add a new...", etc.
    /^total$/i.test(text) || // "Total" as standalone
    text.includes("track your work")
  ) {
    // Contains specific phrase
    return true;
  }

  // For everything else, check if it contains actual words
  // This is a good heuristic for UI text vs. code
  return /[a-z][a-z\s]+/i.test(text);
}

/**
 * Check if string is in a non-translatable attribute
 * @param {string} fullText - Complete document text
 * @param {number} position - Position in text
 * @returns {boolean} True if in a non-translatable attribute
 */
function isInNonTranslatableAttribute(fullText, position) {
  // Look back for attribute name
  const textBefore = fullText.substring(Math.max(0, position - 30), position);

  // Common attributes that don't need translation
  const nonTranslatableAttrs = [
    "className",
    "style",
    "id",
    "key",
    "ref",
    "type",
    "name",
    "value",
    "href",
    "src",
    "alt",
    "onClick",
    "onChange",
    "onSubmit",
    "onFocus",
    "onBlur",
  ];

  // Special case: These attributes typically need translation
  const translatableAttrs = ["placeholder", "aria-label", "title"];

  // Check if any of these attributes precede the string
  for (const attr of nonTranslatableAttrs) {
    const attrPattern = new RegExp(`${attr}\\s*=\\s*$`);
    if (attrPattern.test(textBefore)) {
      // If it's one of the translatable attrs, don't skip it
      return !translatableAttrs.includes(attr);
    }
  }

  return false;
}

module.exports = {
  registerTextHighlighter,
};

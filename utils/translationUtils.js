// utils/translationUtils.js - Utilities for working with translation files and keys
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const util = require("util");

const readFile = util.promisify(fs.readFile);
const writeFile = util.promisify(fs.writeFile);

/**
 * Extract translation key from the editor's current cursor position
 * @param {vscode.TextEditor} editor - The active text editor
 * @returns {string|null} The translation key or null if not found
 */
function findTranslationKey(editor) {
  const selection = editor.selection;
  let translationKey;

  if (selection.isEmpty) {
    // No selection, try to find t() pattern under cursor
    const document = editor.document;
    const cursorPosition = selection.active;
    const line = document.lineAt(cursorPosition.line).text;

    // Match t("path.to.key") pattern
    const regex = /t\(["']([\w\.]+)["']\)/g;
    let match;
    let foundKey = null;

    while ((match = regex.exec(line)) !== null) {
      const keyStart = document.positionAt(
        document.offsetAt(new vscode.Position(cursorPosition.line, 0)) +
          match.index +
          3
      );
      const keyEnd = document.positionAt(
        document.offsetAt(new vscode.Position(cursorPosition.line, 0)) +
          match.index +
          3 +
          match[1].length
      );

      if (
        cursorPosition.isAfterOrEqual(keyStart) &&
        cursorPosition.isBeforeOrEqual(keyEnd)
      ) {
        foundKey = match[1];
        break;
      }
    }

    if (foundKey) {
      translationKey = foundKey;
    } else {
      // Try to detect if cursor is inside a t("...") call
      const beforeCursor = line.substring(0, cursorPosition.character);
      const afterCursor = line.substring(cursorPosition.character);

      const lastTBeforeCursor = beforeCursor.lastIndexOf('t("');
      const lastSingleQuoteTBeforeCursor = beforeCursor.lastIndexOf("t('");

      if (lastTBeforeCursor >= 0 || lastSingleQuoteTBeforeCursor >= 0) {
        const quoteType = lastTBeforeCursor >= 0 ? '"' : "'";
        const tStart =
          lastTBeforeCursor >= 0
            ? lastTBeforeCursor
            : lastSingleQuoteTBeforeCursor;
        const closingQuoteAfterCursor = afterCursor.indexOf(quoteType);

        if (closingQuoteAfterCursor >= 0) {
          const startOfKey = tStart + 3; // After t("
          const keyFragment =
            beforeCursor.substring(startOfKey) +
            afterCursor.substring(0, closingQuoteAfterCursor);
          translationKey = keyFragment;
        }
      }
    }
  } else {
    // Use selection
    translationKey = editor.document.getText(selection);

    // If selection contains t("key"), extract just the key
    const match = translationKey.match(/t\(["'](.+)["']\)/);
    if (match) {
      translationKey = match[1];
    }
  }

  return translationKey;
}

/**
 * Find translation files in the workspace
 * @returns {Promise<Object>} Object with translations and file paths by language
 */
async function findTranslationFiles() {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders) {
    throw new Error("No workspace folder open");
  }

  const workspaceRoot = workspaceFolders[0].uri.fsPath;

  // Common paths for translation files
  const possiblePaths = [
    path.join(workspaceRoot, "messages", "en.json"),
    path.join(workspaceRoot, "messages", "nl.json"),
    path.join(workspaceRoot, "locales", "en.json"),
    path.join(workspaceRoot, "locales", "nl.json"),
    path.join(workspaceRoot, "public", "locales", "en", "common.json"),
    path.join(workspaceRoot, "src", "messages", "en.json"),
    path.join(workspaceRoot, "src", "messages", "nl.json"),
    path.join(workspaceRoot, "src", "locales", "en.json"),
    path.join(workspaceRoot, "src", "locales", "nl.json"),
  ];

  // Try to find translation files
  const translations = {};
  const translationFilePaths = {};
  let translationFilesFound = false;

  for (const filePath of possiblePaths) {
    if (fs.existsSync(filePath)) {
      translationFilesFound = true;
      const lang = path.basename(filePath, ".json");
      const content = await readFile(filePath, "utf8");
      translations[lang] = JSON.parse(content);
      translationFilePaths[lang] = filePath;
    }
  }

  if (!translationFilesFound) {
    // If standard locations don't work, try to find files using glob
    const files = await vscode.workspace.findFiles(
      "**/*.json",
      "**/node_modules/**"
    );

    for (const file of files) {
      try {
        const content = await vscode.workspace.fs.readFile(file);
        const jsonContent = Buffer.from(content).toString("utf8");
        const json = JSON.parse(jsonContent);

        // Heuristic to detect if this is a translation file
        if (hasNestedStructure(json) && hasCommonTranslationKeys(json)) {
          const fileName = path.basename(file.fsPath);
          const lang = fileName.replace(".json", "");
          translations[lang] = json;
          translationFilePaths[lang] = file.fsPath;
          translationFilesFound = true;
        }
      } catch (e) {
        // Skip files that can't be parsed as JSON
      }
    }
  }

  return { translations, translationFilePaths };
}

/**
 * Get a nested property from an object using dot notation
 * @param {Object} obj - The object to get the property from
 * @param {string} path - The property path in dot notation (e.g., "a.b.c")
 * @returns {*} The property value or undefined if not found
 */
function getNestedProperty(obj, path) {
  const properties = path.split(".");
  let result = obj;

  for (const prop of properties) {
    if (result === undefined || result === null) {
      return undefined;
    }
    result = result[prop];
  }

  return result;
}

/**
 * Set a nested property in an object using dot notation
 * @param {Object} obj - The object to set the property in
 * @param {string} path - The property path in dot notation (e.g., "a.b.c")
 * @param {*} value - The value to set
 */
function setNestedProperty(obj, path, value) {
  const properties = path.split(".");
  const lastProp = properties.pop();
  let current = obj;

  for (const prop of properties) {
    if (current[prop] === undefined) {
      current[prop] = {};
    } else if (typeof current[prop] !== "object") {
      current[prop] = {};
    }
    current = current[prop];
  }

  current[lastProp] = value;
}

/**
 * Write content to a JSON file with formatting
 * @param {string} filePath - Path to the file
 * @param {Object} content - The content to write
 */
async function writeToJsonFile(filePath, content) {
  const jsonString = JSON.stringify(content, null, 2);
  await writeFile(filePath, jsonString, "utf8");
}

/**
 * Check if an object has a nested structure (likely a translation file)
 * @param {Object} obj - The object to check
 * @returns {boolean} True if the object has a nested structure
 */
function hasNestedStructure(obj) {
  return Object.values(obj).some(
    (value) => typeof value === "object" && value !== null
  );
}

/**
 * Check if an object has common translation keys
 * @param {Object} obj - The object to check
 * @returns {boolean} True if the object has common translation keys
 */
function hasCommonTranslationKeys(obj) {
  const commonKeys = [
    "common",
    "general",
    "buttons",
    "forms",
    "navigation",
    "errors",
    "timeEntry",
  ];
  return Object.keys(obj).some((key) => commonKeys.includes(key));
}

/**
 * Flatten nested keys for quick pick
 * @param {Object} obj - The object with nested keys
 * @param {string} prefix - The prefix for keys
 * @returns {Array} Array of flattened keys with values
 */
function flattenKeys(obj, prefix = "") {
  let result = [];

  for (const [key, value] of Object.entries(obj)) {
    const newKey = prefix ? `${prefix}.${key}` : key;

    if (typeof value === "object" && value !== null) {
      result = [...result, ...flattenKeys(value, newKey)];
    } else {
      result.push({ key: newKey, value: value });
    }
  }

  return result;
}

module.exports = {
  findTranslationKey,
  findTranslationFiles,
  getNestedProperty,
  setNestedProperty,
  writeToJsonFile,
  hasNestedStructure,
  hasCommonTranslationKeys,
  flattenKeys,
};

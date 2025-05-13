// commandHandlers.js - Functions for handling all extension commands
const vscode = require("vscode");
const {
  findTranslationKey,
  findTranslationFiles,
  getNestedProperty,
  flattenKeys,
  setNestedProperty,
  writeToJsonFile,
} = require("./utils/translationUtils");

/**
 * Command handler to show translations for the key under cursor
 */
async function showTranslation() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage("No active editor!");
    return;
  }

  // Get translation key under cursor
  const translationKey = findTranslationKey(editor);
  if (!translationKey) {
    vscode.window.showInformationMessage(
      "No translation key found under cursor"
    );
    return;
  }

  try {
    // Find translation files
    const { translations, translationFilePaths } = await findTranslationFiles();

    if (Object.keys(translations).length === 0) {
      vscode.window.showErrorMessage("No translation files found");
      return;
    }

    // Check each language for the translation
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
      // Translation key not found in any language
      const addToFilesOption = "Add to Translation Files";
      const response = await vscode.window.showWarningMessage(
        `Translation key "${translationKey}" not found in any language file`,
        addToFilesOption
      );

      if (response === addToFilesOption) {
        addNewTranslationKey(translationKey, translationFilePaths);
      }
      return;
    }

    // Some translations found, but missing in some languages
    if (missingInLangs.length > 0) {
      const addMissingOption = "Add Missing Translations";

      const message = Object.entries(results)
        .map(([lang, value]) => `${lang}: "${value}"`)
        .join("\n");

      const response = await vscode.window.showInformationMessage(
        `${message}\n\nMissing in: ${missingInLangs.join(", ")}`,
        { modal: false },
        addMissingOption
      );

      if (response === addMissingOption) {
        await addMissingTranslations(
          translationKey,
          results,
          missingInLangs,
          translationFilePaths
        );
      }
    } else {
      // All translations found
      const message = Object.entries(results)
        .map(([lang, value]) => `${lang}: "${value}"`)
        .join("\n");

      vscode.window.showInformationMessage(message, { modal: false });
    }
  } catch (error) {
    vscode.window.showErrorMessage(
      `Error getting translation: ${error.message}`
    );
  }
}

/**
 * Command handler to insert an existing translation key
 */
async function insertTranslationKey() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  try {
    // Find translation files
    const { translations } = await findTranslationFiles();

    if (Object.keys(translations).length === 0) {
      vscode.window.showErrorMessage("No translation files found");
      return;
    }

    // Get a reference language (usually English)
    const referenceLang = Object.keys(translations).includes("en")
      ? "en"
      : Object.keys(translations)[0];

    // Create a flattened list of all keys
    const allKeys = flattenKeys(translations[referenceLang]);

    // Show quick pick to select a key
    const selectedKey = await vscode.window.showQuickPick(
      allKeys.map((entry) => ({
        label: entry.key,
        description: `${entry.value}`,
        detail: entry.key,
      })),
      {
        placeHolder: "Select a translation key",
        matchOnDescription: true,
        matchOnDetail: true,
      }
    );

    if (selectedKey) {
      // Insert t("selected.key") at current position
      editor.edit((editBuilder) => {
        editBuilder.insert(
          editor.selection.active,
          `t("${selectedKey.label}")`
        );
      });
    }
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error.message}`);
  }
}

/**
 * Command handler to add a new translation key
 */
async function addTranslationKey() {
  try {
    // Find translation files
    const { translationFilePaths } = await findTranslationFiles();

    if (Object.keys(translationFilePaths).length === 0) {
      vscode.window.showErrorMessage("No translation files found");
      return;
    }

    // Get the key and default value from user
    const keyInput = await vscode.window.showInputBox({
      prompt: "Enter the translation key (e.g., timeEntry.form.newKey)",
      placeHolder: "timeEntry.form.newKey",
    });

    if (!keyInput) {
      return; // User cancelled
    }

    await addNewTranslationKey(keyInput, translationFilePaths);
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error.message}`);
  }
}

/**
 * Command handler to add a translation key from hover
 * @param {string} translationKey - The translation key to add
 * @param {Object} translationFilePaths - Paths to translation files by language
 */
async function addTranslationKeyFromHover(
  translationKey,
  translationFilePaths
) {
  try {
    await addNewTranslationKey(translationKey, translationFilePaths);
  } catch (error) {
    vscode.window.showErrorMessage(`Error: ${error.message}`);
  }
}

/**
 * Helper function to add a new translation key to all files
 * @param {string} translationKey - The translation key to add
 * @param {Object} translationFilePaths - Paths to translation files by language
 */
async function addNewTranslationKey(translationKey, translationFilePaths) {
  // Get the default value for the key
  const defaultValue = await vscode.window.showInputBox({
    prompt: `Enter the default value for "${translationKey}"`,
    placeHolder: "Translation value",
  });

  if (defaultValue === undefined) {
    return; // User cancelled
  }

  // Add the key to each language file
  for (const [lang, filePath] of Object.entries(translationFilePaths)) {
    try {
      const { content, modified } = await addKeyToTranslationFile(
        filePath,
        translationKey,
        defaultValue
      );

      if (modified) {
        await writeToJsonFile(filePath, content);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to add key to ${lang} file: ${error.message}`
      );
    }
  }

  vscode.window.showInformationMessage(
    `Added "${translationKey}" to all translation files`
  );
}

/**
 * Helper function to add missing translations for a key
 * @param {string} translationKey - The translation key
 * @param {Object} existingTranslations - Existing translations by language
 * @param {string[]} missingLangs - Languages where the translation is missing
 * @param {Object} translationFilePaths - Paths to translation files by language
 */
async function addMissingTranslations(
  translationKey,
  existingTranslations,
  missingLangs,
  translationFilePaths
) {
  // Use the first available translation as reference
  const referenceLang = Object.keys(existingTranslations)[0];
  const referenceValue = existingTranslations[referenceLang];

  for (const lang of missingLangs) {
    // Get translation value from user
    const translationValue = await vscode.window.showInputBox({
      prompt: `Enter the ${lang} translation for "${translationKey}" (${referenceLang}: "${referenceValue}")`,
      placeHolder: referenceValue,
    });

    if (translationValue === undefined) {
      continue; // Skip this language if user cancelled
    }

    try {
      const filePath = translationFilePaths[lang];
      const { content, modified } = await addKeyToTranslationFile(
        filePath,
        translationKey,
        translationValue
      );

      if (modified) {
        await writeToJsonFile(filePath, content);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Failed to add ${lang} translation: ${error.message}`
      );
    }
  }

  vscode.window.showInformationMessage(
    `Added missing translations for "${translationKey}"`
  );
}

/**
 * Helper function to add a key to a translation file
 * @param {string} filePath - Path to the translation file
 * @param {string} key - Translation key to add
 * @param {string} value - Translation value
 * @returns {Object} - Object containing the modified content and a flag if modified
 */
async function addKeyToTranslationFile(filePath, key, value) {
  const fs = require("fs");
  const util = require("util");
  const readFile = util.promisify(fs.readFile);

  const fileContent = await readFile(filePath, "utf8");
  const content = JSON.parse(fileContent);

  // Check if key already exists
  const existingValue = getNestedProperty(content, key);
  if (existingValue !== undefined) {
    return { content, modified: false };
  }

  // Add the key
  setNestedProperty(content, key, value);

  return { content, modified: true };
}

module.exports = {
  showTranslation,
  insertTranslationKey,
  addTranslationKey,
  addTranslationKeyFromHover,
};

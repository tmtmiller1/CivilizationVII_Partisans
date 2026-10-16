// Dev-only ESLint flat config: the size limits the other Tower mods use, plus the usual correctness rules.

const ENGINE_GLOBALS = {
  Game: "readonly", GameContext: "readonly", Players: "readonly", GameInfo: "readonly", Database: "readonly", GameplayMap: "readonly",
  Configuration: "readonly", Locale: "readonly", engine: "readonly", Controls: "readonly", Cities: "readonly",
  Districts: "readonly", MapCities: "readonly", MapUnits: "readonly", MapConstructibles: "readonly",
  Constructibles: "readonly", Units: "readonly", UI: "readonly", DistrictTypes: "readonly",
  CityTransferTypes: "readonly", IndependentRelationship: "readonly", DiplomacyActionTypes: "readonly",
  PlayerOperationTypes: "readonly", YieldTypes: "readonly", Camera: "readonly"
};

const BROWSER_GLOBALS = {
  window: "readonly", document: "readonly", console: "readonly", localStorage: "readonly", globalThis: "readonly",
  setTimeout: "readonly", clearTimeout: "readonly", setInterval: "readonly", clearInterval: "readonly",
  MutationObserver: "readonly", CustomEvent: "readonly", process: "readonly", URL: "readonly"
};

export default [
  // Tower Settings Keeper, copied unchanged from its own repo; it is linted and tested there.
  { ignores: ["ui/settings-keeper.js", "dist/**", "node_modules/**"] },
  {
    files: ["ui/**/*.js", "tests/**/*.mjs", "scripts/**/*.mjs"],
    languageOptions: { ecmaVersion: "latest", sourceType: "module", globals: { ...ENGINE_GLOBALS, ...BROWSER_GLOBALS } },
    rules: {
      complexity: ["error", 10],
      "max-lines-per-function": ["error", { max: 50, skipBlankLines: true, skipComments: true, IIFEs: true }],
      "max-lines": ["error", { max: 500, skipBlankLines: true, skipComments: true }],
      "max-len": ["error", { code: 120, ignoreUrls: true, ignoreStrings: true, ignoreTemplateLiterals: true,
        ignoreRegExpLiterals: true }],
      "max-params": ["error", 5],
      "max-depth": ["error", 4],
      "max-statements": ["error", 18],
      "no-undef": "error",
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      eqeqeq: ["error", "always", { null: "ignore" }]
    }
  },
  {
    files: ["tests/**/*.mjs"],
    rules: { "max-lines-per-function": "off", "max-statements": "off", "max-lines": "off", complexity: "off", "max-len": "off" }
  },
  {
    // The Steam change-note script is the same file in every Tower mod; only the correctness rules apply to it here.
    files: ["scripts/steam-changelog.mjs"],
    rules: { "max-lines-per-function": "off", "max-statements": "off", complexity: "off" }
  }
];

module.exports = {
  'env': {
    'browser': true,
    'es6': true
  },
  'parserOptions': {
    'ecmaVersion': '2018',
    'ecmaFeatures': {
        'experimentalObjectRestSpread': true,
        'jsx': true
    },
    'sourceType': 'module'
  },

  'rules': {
    // Do not require jsdoc for everything.
    // This is more permissive than Google.  Decided on 11 July 2019.
    // Items that could be required to have jsdoc documentation:
    //   "FunctionDeclaration"
    //   "ClassDeclaration"
    //   "MethodDefinition"
    //   "ArrowFunctionExpression"
    //   "FunctionExpression"
    'require-jsdoc': 'off',

    // Do not require const if a variable is never modified after instantation.
    // This is more permissive than Google.  Decided on 11 July 2019.
    'prefer-const': 'off',

    // Always require curly braces for blocks (e.g. if statements).
    // This is more strict than Google.  Decided on 15 July 2019.
    'curly': ['error', 'all'],

    // Use K&R brace style, also called "the one true brace style." 
    // Brace goes at end of line, not newline. Decided on 11 July 2019.
    // Example:
    // int main(int argc, char *argv[])
    // {
    //   ...
    //   while (x == y) {
    //     something();
    //     somethingelse();
    // 
    //     if (some_error) {
    //       do_correct();
    //     } else {
    //       continue_as_usual();
    //     }
    //   }
    // 
    //   finalthing();
    //   ...
    // }
    'brace-style': ['error', '1tbs', {'allowSingleLine': true}],

    // Allow more than 80 characters in a line.  Decided on 11 July 2019.
    'max-len': 'off',

    // Enforce many forms of indenting.
    // We agreed on 15 July 2019 that we would use two spaces for indenting. The
    // rest of these settings weren't discussed.
    'indent': ['error', 2, {
      SwitchCase: 1,
      VariableDeclarator: 1,
      outerIIFEBody: 1,
      FunctionDeclaration: {
        parameters: 1,
        body: 1
      },
      FunctionExpression: {
        parameters: 1,
        body: 1
      },
      CallExpression: {
        arguments: 1
      },
      ArrayExpression: 1,
      ObjectExpression: 'first',
      ImportDeclaration: 1,
      flatTernaryExpressions: false,
      // list derived from https://github.com/benjamn/ast-types/blob/HEAD/def/jsx.js
      ignoredNodes: ['JSXElement', 'JSXElement > *', 'JSXAttribute', 'JSXIdentifier', 'JSXNamespacedName', 'JSXMemberExpression', 'JSXSpreadAttribute', 'JSXExpressionContainer', 'JSXOpeningElement', 'JSXClosingElement', 'JSXText', 'JSXEmptyExpression', 'JSXSpreadChild'],
      ignoreComments: false
    }],

    // Do not enforce space or no-space inside of array after opening and before
    // closing brace.  Decided on 15 July 2019.
    'array-bracket-spacing': [ 'off' ],

    // Do not enforce space or no-space inside of blocks after opening and
    // before closing block. Not explicitly discussed, but follows the pattern
    // of array-bracket-spacing and object-curly-spacing discussed on 15 July
    // 2019.
    'block-spacing': [ 'off' ],

    // Do not enforce space or no-space inside of objects after opening and
    // before closing brace.  Decided on 15 July 2019.
    'object-curly-spacing': ['off'],

    // Require space around operators.
    // Decided on 15 July 2019 by Adam and Yoshiki and Jamis's code.
    'space-infix-ops': [ 'error' ],

    // Allow more than one space to allow alignment on value with empty lines in
    // between.  This is more permissive than the base Google style.
    'key-spacing': [ 'error', {
      beforeColon: false,
      afterColon: true,
      mode: "minimum"
    }],

    // Require === and !== .  Decided on 11 July 2019.
    'eqeqeq': ['error', 'always'],

    // Raise an error if a case statement with code doesn't have a break. Add a
    // comment "// break ommitted" to avoid the error. Decided on 11 July 2019.
    'no-fallthrough': ['error', { 'commentPattern': 'break[\\s\\w]*omitted' }],

    // We prefer camelcase, but prefer not to enforce it to make exceptions
    // easier to deal with.  Decided on 11 July 2019.
    'camelcase': ['off'],

    // Use arrow callback when possible.  Decided on 15 July 2019.
    'prefer-arrow-callback': ['error'],

    'quote-props': ['off'],

    // Do not allow undefined variables to be referenced.
    // Decided on 17 July 2019
    //
    // global variables must be declared in a comment, writable global
    // variables must have :true. For example, if a is a writable global
    // variable and b is a read-only global variable:
    //
    // /* global a:true, b */
    //
    // Note that you can specify an environment to include known global
    // variables.
    //
    // /*eslint-env node*/
    //
    // The es6 and browser environments are already specified in this file.
    'no-undef': [ 'error', { "typeof": true }]
  }
};

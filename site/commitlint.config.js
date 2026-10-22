export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'subject-case': [0],
    'body-max-line-length': [0],
    'footer-max-line-length': [0],
    'header-max-length': [2, 'always', 100],
    // The scope is the piece, or what spans them (root CLAUDE.md, « Working in the repository »).
    'scope-enum': [2, 'always', ['site', 'pipeline', 'musilogy', 'azuracast', 'repo', 'deps']],
  },
};

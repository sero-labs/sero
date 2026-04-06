#!/usr/bin/env node

const path = require('path');
const { createRequire } = require('module');

const promptfooEntry = require.resolve('promptfoo');
const promptfooRoot = path.resolve(promptfooEntry, '../../..');
const promptfooRequire = createRequire(path.join(promptfooRoot, 'package.json'));

const { Command } = promptfooRequire('commander');
const { version } = promptfooRequire('./package.json');
const { checkNodeVersion } = promptfooRequire('./dist/src/checkNodeVersion.js');
const { authCommand } = promptfooRequire('./dist/src/commands/auth.js');
const { cacheCommand } = promptfooRequire('./dist/src/commands/cache.js');
const { configCommand } = promptfooRequire('./dist/src/commands/config.js');
const { debugCommand } = promptfooRequire('./dist/src/commands/debug.js');
const { deleteCommand } = promptfooRequire('./dist/src/commands/delete.js');
const { evalCommand } = promptfooRequire('./dist/src/commands/eval.js');
const { exportCommand } = promptfooRequire('./dist/src/commands/export.js');
const { feedbackCommand } = promptfooRequire('./dist/src/commands/feedback.js');
const { generateDatasetCommand } = promptfooRequire('./dist/src/commands/generate/dataset.js');
const { importCommand } = promptfooRequire('./dist/src/commands/import.js');
const { initCommand } = promptfooRequire('./dist/src/commands/init.js');
const { listCommand } = promptfooRequire('./dist/src/commands/list.js');
const { shareCommand } = promptfooRequire('./dist/src/commands/share.js');
const { showCommand } = promptfooRequire('./dist/src/commands/show.js');
const { viewCommand } = promptfooRequire('./dist/src/commands/view.js');
const logger = promptfooRequire('./dist/src/logger.js').default;
const { runDbMigrations } = promptfooRequire('./dist/src/migrate.js');
const { redteamGenerateCommand } = promptfooRequire('./dist/src/redteam/commands/generate.js');
const { initCommand: redteamInitCommand } = promptfooRequire('./dist/src/redteam/commands/init.js');
const { pluginsCommand } = promptfooRequire('./dist/src/redteam/commands/plugins.js');
const { redteamReportCommand } = promptfooRequire('./dist/src/redteam/commands/report.js');
const { redteamRunCommand } = promptfooRequire('./dist/src/redteam/commands/run.js');
const { redteamSetupCommand } = promptfooRequire('./dist/src/redteam/commands/setup.js');
const { checkForUpdates } = promptfooRequire('./dist/src/updates.js');
const { loadDefaultConfig } = promptfooRequire('./dist/src/util/config/default.js');

async function main() {
  await checkForUpdates();
  await runDbMigrations();

  const { defaultConfig, defaultConfigPath } = await loadDefaultConfig();
  const program = new Command('promptfoo');

  program
    .version(version)
    .showHelpAfterError()
    .showSuggestionAfterError()
    .on('option:*', function () {
      logger.error('Invalid option(s)');
      program.help();
      process.exitCode = 1;
    });

  evalCommand(program, defaultConfig, defaultConfigPath);
  initCommand(program);
  viewCommand(program);

  const redteamBaseCommand = program.command('redteam').description('Red team LLM applications');
  shareCommand(program);
  authCommand(program);
  cacheCommand(program);
  configCommand(program);
  debugCommand(program, defaultConfig, defaultConfigPath);
  deleteCommand(program);
  exportCommand(program);
  feedbackCommand(program);
  const generateCommand = program.command('generate').description('Generate synthetic data');
  importCommand(program);
  listCommand(program);
  showCommand(program);
  generateDatasetCommand(generateCommand, defaultConfig, defaultConfigPath);
  redteamGenerateCommand(generateCommand, 'redteam', defaultConfig, defaultConfigPath);

  const {
    defaultConfig: redteamConfig,
    defaultConfigPath: redteamConfigPath,
  } = await loadDefaultConfig(undefined, 'redteam');

  redteamInitCommand(redteamBaseCommand);
  evalCommand(redteamBaseCommand, redteamConfig ?? defaultConfig, redteamConfigPath ?? defaultConfigPath);
  redteamGenerateCommand(redteamBaseCommand, 'generate', defaultConfig, defaultConfigPath);
  redteamRunCommand(redteamBaseCommand);
  redteamReportCommand(redteamBaseCommand);
  redteamSetupCommand(redteamBaseCommand);
  pluginsCommand(redteamBaseCommand);

  program.parse(process.argv, { from: 'node' });
}

checkNodeVersion();
main();

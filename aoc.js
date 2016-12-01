const fs = require('fs');
const path = require('path');
const readline = require('readline');
const requestify = require('requestify');
const yargs = require('yargs');
const mkdirp = require('mkdirp');
const cheerio = require('cheerio');
const toMarkdown = require('to-markdown');

const argv = yargs
  .usage('Usage: $0 -l [num] -s [string]')
  .demand(['l'])
  .alias('l', 'level')
  .alias('s', 'session-cookie')
  .argv;

const {level} = argv;

const LEVEL_URL = 'http://adventofcode.com/2016/day/' + level;
const TESTS_FILENAME = 'tests.js';

const loadOrPromptSession = async () => {
  const sessionPath = path.join(__dirname, 'SESSION_COOKIE');
  const argSesssion = argv['session-cookie'];
  if (argSesssion) {
    return argSesssion;
  } else if (fs.existsSync(sessionPath)) {
    return fs.readFileSync('SESSION_COOKIE', 'utf-8');
  } else {
    const rl = readline.createInterface(process.stdin, process.stdout);
    rl.setPrompt('Plox paste the value of your session cookie> ');
    rl.prompt();
    return new Promise((resolve, reject) => {
      rl.on('line', (line) => {
        if (line.length) {
          rl.close();
          fs.writeFile(sessionPath, line, (err) => {
            err ? reject(err) : resolve(line);
          });
        } else {
          rl.prompt();
        }
      });
    });
  }
};

const getInput = async (session) => {
  const inputPath = path.join(__dirname, 'inputs', session, level.toString());
  if (fs.existsSync(inputPath)) {
    return fs.readFileSync(inputPath, 'utf-8');
  } else {
    const res = await requestify.get(LEVEL_URL + '/input', {cookies: {session}});
    const body = res.getBody();
    const code = res.getCode();
    if (code == 200) {
      mkdirp.sync(path.dirname(inputPath));
      fs.writeFileSync(inputPath, body, 'utf-8');
      return body;
    } else {
      throw new Error(body);
    }
  }
};

const buildSolution = async ([part1Path, part2Path], session) => {
  const solutionDirname = path.dirname(part1Path);
  mkdirp.sync(solutionDirname);

  const template = fs.readFileSync(path.join('.', 'solution_template.js'), 'utf-8');
  if (!fs.existsSync(part1Path)) fs.writeFileSync(part1Path, template);
  if (!fs.existsSync(part2Path)) fs.writeFileSync(part2Path, template);

  const readmePath = path.join(solutionDirname, 'README.md');
  if (
    !fs.existsSync(readmePath) ||
    !fs.readFileSync(readmePath, 'utf-8').includes('Part Two')
  ) {
    const res = await requestify.get(LEVEL_URL, {cookies: {session}});
    const body = res.getBody();
    const $ = cheerio.load(body);
    const $article = $('article.day-desc');

    fs.writeFileSync(readmePath,
      toMarkdown(
        $article.map((i, article) => $(article).html()).toArray().join(''),
        {converters: [
          {filter: 'em', replacement: (content) => `**${content}**`}
        ]}
      )
    );
    const testTexts = $article.find('li').map((i, li) => $(li).text()).toArray();
    const testsPath = path.join(solutionDirname, TESTS_FILENAME);
    if (!fs.existsSync(testsPath)) fs.writeFileSync(testsPath,
      `const assert = require('assert');
const solve1 = require('./part-1.js');
const solve2 = require('./part-2.js');

module.exports = [
  [
${testTexts.map((text) => (
        `    () => {
      // ${text}
    }`
      )).join(',\n')}
  ],
  [
    // Add tests for part-2 here
  ]
];` );
  }
};

const start = async () => {
  const session = await loadOrPromptSession();
  const input = await getInput(session);
  const solutionDirname = path.join(__dirname, 'solutions', level.toString());
  const part1Path = path.join(solutionDirname, 'part-1.js');
  const part2Path = path.join(solutionDirname, 'part-2.js');

  await buildSolution([part1Path, part2Path], session);
  const tests = require(path.join(solutionDirname, TESTS_FILENAME));
  let testCount = 0;
  try {
    for (const partTests of tests) {
      await Promise.all(partTests.map((t) => {
        testCount++;
        t();
      }));
    }
  } catch (e) {
    return console.error('Failed test(s)', e);
  }
  if (testCount > 0) console.log(`All ${testCount} tests passed!`);
  const answer1 = await require(part1Path)(input);
  const answer2 = await require(part2Path)(input);
  console.log(`Your answers to level ${level} are ${answer1} and ${answer2}`);
};

start();



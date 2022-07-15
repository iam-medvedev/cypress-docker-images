// creates new folder included/<Cypress version> with Dockerfile and README file
const path = require("path")
const fs = require("fs")
const shelljs = require("shelljs")
const { isStrictSemver } = require("../utils")

const versionTag = process.argv[2]
const baseImageTag = process.argv[3]

if (!versionTag || !isStrictSemver(versionTag)) {
  console.error('expected Cypress version argument like "3.8.3"')
  process.exit(1)
}
if (!baseImageTag) {
  console.error('expected base Docker image tag like "cypress/browsers:node12.6.0-chrome77"')
  process.exit(1)
}
if (!baseImageTag.startsWith("cypress/browsers:")) {
  console.error('expected the base Docker image tag to be one of "cypress/browsers:*"')
  console.error('but it was "%s"', baseImageTag)
  process.exit(1)
}

let outputFolder = path.join("included", versionTag)

//if same <versionTag> folder already exists, add new folder named <versionTag>-<baseImageTag>
if (shelljs.test("-d", outputFolder)) {
  console.log('existing folder "%s" found', outputFolder)
  outputFolder = path.join("included", `${versionTag}-${baseImageTag.split(":")[1]}`)
}
console.log('creating "%s"', outputFolder)
shelljs.mkdir(outputFolder)

const folderName = outputFolder.split("/")[1]

const Dockerfile = `
# WARNING: this file was autogenerated by ${path.basename(__filename)}
# using
#   npm run add:included -- ${versionTag} ${baseImageTag}
#
# build this image with command
#   docker build -t cypress/included:${folderName} .
#
FROM ${baseImageTag}

# avoid too many progress messages
# https://github.com/cypress-io/cypress/issues/1243
ENV CI=1 \\
# disable shared memory X11 affecting Cypress v4 and Chrome
# https://github.com/cypress-io/cypress-docker-images/issues/270
  QT_X11_NO_MITSHM=1 \\
  _X11_NO_MITSHM=1 \\
  _MITSHM=0 \\
  # point Cypress at the /root/cache no matter what user account is used
  # see https://on.cypress.io/caching
  CYPRESS_CACHE_FOLDER=/root/.cache/Cypress \\
  # Allow projects to reference globally installed cypress
  NODE_PATH=/usr/local/lib/node_modules

# should be root user
RUN echo "whoami: $(whoami)" \\
  && npm config -g set user $(whoami) \\
  # command "id" should print:
  # uid=0(root) gid=0(root) groups=0(root)
  # which means the current user is root
  && id \\
  && npm install -g typescript \\
  && npm install -g "cypress@${versionTag}" \\
  && cypress verify \\
  # Cypress cache and installed version
  # should be in the root user's home folder
  && cypress cache path \\
  && cypress cache list \\
  && cypress info \\
  && cypress version \\
  # give every user read access to the "/root" folder where the binary is cached
  # we really only need to worry about the top folder, fortunately
  && ls -la /root \\
  && chmod 755 /root \\
  # always grab the latest Yarn
  # otherwise the base image might have old versions
  # NPM does not need to be installed as it is already included with Node.
  && npm i -g yarn@latest \\
  # Show where Node loads required modules from
  && node -p 'module.paths' \\
  # should print Cypress version
  # plus Electron and bundled Node versions
  && cypress version \\
  && echo  " node version:    $(node -v) \\n" \\
    "npm version:     $(npm -v) \\n" \\
    "yarn version:    $(yarn -v) \\n" \\
    "typescript version:  $(tsc -v) \\n" \\
    "debian version:  $(cat /etc/debian_version) \\n" \\
    "user:            $(whoami) \\n" \\
    "chrome:          $(google-chrome --version || true) \\n" \\
    "firefox:         $(firefox --version || true) \\n"

ENTRYPOINT ["cypress", "run"]
`
const dockerFilename = path.join(outputFolder, "Dockerfile")
fs.writeFileSync(dockerFilename, Dockerfile.trim() + "\n", "utf8")
console.log("Saved %s", dockerFilename)

const README = `
<!--
WARNING: this file was autogenerated by ${path.basename(__filename)} using

    npm run add:included -- ${versionTag} ${baseImageTag}
-->

# cypress/included:${folderName}

Read [Run Cypress with a single Docker command][blog post url]

## Run tests

\`\`\`shell
$ docker run -it -v $PWD:/e2e -w /e2e cypress/included:${folderName}
# runs Cypress tests from the current folder
\`\`\`

**Note:** Currently, the linux/arm64 build of this image does not contain any browsers except Electron. See https://github.com/cypress-io/cypress-docker-images/issues/695 for more information.

[blog post url]: https://www.cypress.io/blog/2019/05/02/run-cypress-with-a-single-docker-command/
`

const readmeFilename = path.join(outputFolder, "README.md")
fs.writeFileSync(readmeFilename, README.trim() + "\n", "utf8")
console.log("Saved %s", readmeFilename)

// to make building images simpler and to follow the same pattern as previous builds
const buildScript = `
# WARNING: this file was autogenerated by ${path.basename(__filename)}
# using
#   npm run add:included -- ${versionTag} ${baseImageTag}
set e+x

LOCAL_NAME=cypress/included:${folderName}
echo "Building $LOCAL_NAME"
docker build -t $LOCAL_NAME .
`

const buildFilename = path.join(outputFolder, "build.sh")
fs.writeFileSync(buildFilename, buildScript.trim() + "\n", "utf8")
shelljs.chmod("a+x", buildFilename)
console.log("Saved %s", buildFilename)

console.log(`
Please add the newly generated folder ${outputFolder} to Git. Build the Docker container locally to make sure it is correct`)

// GENERATE INCLUDED CONFIG
require("child_process").fork(__dirname + "/generate-config.js", ["included", folderName])

// GENERATE INCLUDED README WITH UPDATE CHANGELOG
require("child_process").fork(__dirname + "/generate-included-readme.js", [folderName, baseImageTag])

// ASK USER IF THEY WANT TO COMMIT CHANGES
require("child_process").fork(__dirname + "/generate-commit.js", ["included", folderName])

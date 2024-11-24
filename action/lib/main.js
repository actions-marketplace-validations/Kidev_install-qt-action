"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = __importStar(require("crypto"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const process = __importStar(require("process"));
const cache = __importStar(require("@actions/cache"));
const core = __importStar(require("@actions/core"));
const exec_1 = require("@actions/exec");
const glob = __importStar(require("glob"));
const compare_versions_1 = require("compare-versions");
const compareVersions = (v1, op, v2) => {
    return (0, compare_versions_1.compare)(v1, v2, op);
};
const setOrAppendEnvVar = (name, value) => {
    const oldValue = process.env[name];
    let newValue = value;
    if (oldValue) {
        newValue = `${oldValue}:${newValue}`;
    }
    core.exportVariable(name, newValue);
};
const dirExists = (dir) => {
    try {
        return fs.statSync(dir).isDirectory();
    }
    catch (err) {
        return false;
    }
};
// Names of directories for tools that include binaries in the
// base directory instead of a bin directory
const binlessToolDirectories = ["Conan", "Ninja"];
const toolsPaths = (installDir) => {
    const binlessPaths = binlessToolDirectories
        .map((dir) => path.join(installDir, "Tools", dir))
        .filter((dir) => dirExists(dir));
    return [
        "Tools/**/bin",
        "*.app/Contents/MacOS",
        "*.app/**/bin",
        "Tools/*/*.app/Contents/MacOS",
        "Tools/*/*.app/**/bin",
    ]
        .flatMap((p) => glob.sync(`${installDir}/${p}`))
        .concat(binlessPaths)
        .map((p) => path.resolve(p));
};
const pythonCommand = (command, args) => {
    const python = process.platform === "win32" ? "python" : "python3";
    return `${python} -m ${command} ${args.join(" ")}`;
};
const execPython = (command, args) => __awaiter(void 0, void 0, void 0, function* () {
    return (0, exec_1.exec)(pythonCommand(command, args));
});
const getPythonOutput = (command, args) => __awaiter(void 0, void 0, void 0, function* () {
    const out = yield (0, exec_1.getExecOutput)(pythonCommand(command, args));
    return out.stdout + out.stderr;
});
const flaggedList = (flag, listArgs) => {
    return listArgs.length ? [flag, ...listArgs] : [];
};
const locateQtArchDir = (installDir) => {
    const qtArchDirs = glob
        .sync(`${installDir}/[0-9]*/*/bin/qmake*`)
        .map((s) => path.resolve(s, "..", ".."));
    const requiresParallelDesktop = qtArchDirs.filter((archPath) => {
        const archDir = path.basename(archPath);
        const versionDir = path.basename(path.join(archPath, ".."));
        return versionDir.match(/^6\.\d+\.\d+$/) && archDir.match(/^(android*|ios|wasm*|msvc*_arm64)$/);
    });
    if (requiresParallelDesktop.length) {
        return requiresParallelDesktop[0];
    }
    else if (!qtArchDirs.length) {
        throw Error(`Failed to locate a Qt installation directory in ${installDir}`);
    }
    else {
        return qtArchDirs[0];
    }
};
const isAutodesktopSupported = () => __awaiter(void 0, void 0, void 0, function* () {
    const rawOutput = yield getPythonOutput("aqt", ["version"]);
    const match = rawOutput.match(/aqtinstall\(aqt\)\s+v(\d+\.\d+\.\d+)/);
    // Support both original aqtinstall 3.0.0+ and Kidev's fork 3.2.0+
    return match ? compareVersions(match[1], ">=", "3.0.0") || match[1].startsWith("3.2.") : false;
});
class Inputs {
    constructor() {
        const host = core.getInput("host");
        if (!host) {
            switch (process.platform) {
                case "win32": {
                    this.host = "windows";
                    break;
                }
                case "darwin": {
                    this.host = "mac";
                    break;
                }
                default: {
                    this.host = "linux";
                    break;
                }
            }
        }
        else {
            if (host === "windows" || host === "mac" || host === "linux") {
                this.host = host;
            }
            else {
                throw TypeError(`host: "${host}" is not one of "windows" | "mac" | "linux"`);
            }
        }
        const target = core.getInput("target");
        if (target === "desktop" || target === "android" || target === "ios") {
            this.target = target;
        }
        else {
            throw TypeError(`target: "${target}" is not one of "desktop" | "android" | "ios"`);
        }
        const wasm = core.getInput("wasm");
        if (wasm === "none" || wasm === "singlethread" || wasm === "multithread") {
            this.wasm = wasm;
        }
        else {
            throw TypeError(`wasm: "${wasm}" is not one of "none" | "singlethread" | "multithread"`);
        }
        this.version = core.getInput("version");
        this.arch = core.getInput("arch");
        if (!this.arch) {
            if (this.target === "android") {
                if (compareVersions(this.version, ">=", "5.14.0") &&
                    compareVersions(this.version, "<", "6.0.0")) {
                    this.arch = "android";
                }
                else {
                    this.arch = "android_armv7";
                }
            }
            else if (this.host === "windows") {
                if (compareVersions(this.version, ">=", "6.8.0")) {
                    this.arch = "win64_msvc2022_64";
                }
                else if (compareVersions(this.version, ">=", "5.15.0")) {
                    this.arch = "win64_msvc2019_64";
                }
                else if (compareVersions(this.version, "<", "5.6.0")) {
                    this.arch = "win64_msvc2013_64";
                }
                else if (compareVersions(this.version, "<", "5.9.0")) {
                    this.arch = "win64_msvc2015_64";
                }
                else {
                    this.arch = "win64_msvc2017_64";
                }
            }
        }
        const dir = core.getInput("dir") || process.env.RUNNER_WORKSPACE;
        if (!dir) {
            throw TypeError(`"dir" input may not be empty`);
        }
        this.dir = path.resolve(dir, "Qt");
        this.modules = Inputs.getStringArrayInput("modules");
        this.archives = Inputs.getStringArrayInput("archives");
        this.tools = Inputs.getStringArrayInput("tools").map((tool) => tool.replace(/,/g, " "));
        this.addToolsToPath = Inputs.getBoolInput("add-tools-to-path");
        this.extra = Inputs.getStringArrayInput("extra");
        const installDeps = core.getInput("install-deps").toLowerCase();
        if (installDeps === "nosudo") {
            this.installDeps = "nosudo";
        }
        else {
            this.installDeps = installDeps === "true";
        }
        this.cache = Inputs.getBoolInput("cache");
        this.cacheKeyPrefix = core.getInput("cache-key-prefix");
        this.isInstallQtBinaries =
            !Inputs.getBoolInput("tools-only") && !Inputs.getBoolInput("no-qt-binaries");
        this.setEnv = Inputs.getBoolInput("set-env");
        this.aqtSource = core.getInput("aqtsource");
        this.aqtVersion = core.getInput("aqtversion");
        this.py7zrVersion = core.getInput("py7zrversion");
        this.src = Inputs.getBoolInput("source");
        this.srcArchives = Inputs.getStringArrayInput("src-archives");
        this.doc = Inputs.getBoolInput("documentation");
        this.docModules = Inputs.getStringArrayInput("doc-modules");
        this.docArchives = Inputs.getStringArrayInput("doc-archives");
        this.example = Inputs.getBoolInput("examples");
        this.exampleModules = Inputs.getStringArrayInput("example-modules");
        this.exampleArchives = Inputs.getStringArrayInput("example-archives");
    }
    get cacheKey() {
        let cacheKey = this.cacheKeyPrefix;
        for (const keyStringArray of [
            [
                this.host,
                os.release(),
                this.target,
                this.wasm,
                this.arch,
                this.version,
                this.dir,
                this.py7zrVersion,
                this.aqtSource,
                this.aqtVersion,
            ],
            this.modules,
            this.archives,
            this.extra,
            this.tools,
            this.src ? "src" : "",
            this.srcArchives,
            this.doc ? "doc" : "",
            this.docArchives,
            this.docModules,
            this.example ? "example" : "",
            this.exampleArchives,
            this.exampleModules,
        ]) {
            for (const keyString of keyStringArray) {
                if (keyString) {
                    cacheKey += `-${keyString}`;
                }
            }
        }
        cacheKey = cacheKey.replace(/,/g, "-");
        const maxKeyLength = 512;
        if (cacheKey.length > maxKeyLength) {
            const hashedCacheKey = crypto.createHash("sha256").update(cacheKey).digest("hex");
            cacheKey = `${this.cacheKeyPrefix}-${hashedCacheKey}`;
        }
        return cacheKey;
    }
    static getBoolInput(name) {
        return core.getInput(name).toLowerCase() === "true";
    }
    static getStringArrayInput(name) {
        const content = core.getInput(name);
        return content ? content.split(" ") : [];
    }
}
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    const inputs = new Inputs();
    // Qt installer assumes basic requirements that are not installed by
    // default on Ubuntu.
    if (process.platform === "linux") {
        if (inputs.installDeps) {
            const dependencies = [
                "build-essential",
                "libgl1-mesa-dev",
                "libgstreamer-gl1.0-0",
                "libpulse-dev",
                "libxcb-glx0",
                "libxcb-icccm4",
                "libxcb-image0",
                "libxcb-keysyms1",
                "libxcb-randr0",
                "libxcb-render-util0",
                "libxcb-render0",
                "libxcb-shape0",
                "libxcb-shm0",
                "libxcb-sync1",
                "libxcb-util1",
                "libxcb-xfixes0",
                "libxcb-xinerama0",
                "libxcb1",
                "libxkbcommon-dev",
                "libxkbcommon-x11-0",
                "libxcb-xkb-dev",
            ];
            if (compareVersions(inputs.version, ">=", "6.5.0")) {
                dependencies.push("libxcb-cursor0");
            }
            const updateCommand = "apt-get update";
            const installCommand = `apt-get install ${dependencies.join(" ")} -y`;
            if (inputs.installDeps === "nosudo") {
                yield (0, exec_1.exec)(updateCommand);
                yield (0, exec_1.exec)(installCommand);
            }
            else {
                yield (0, exec_1.exec)(`sudo ${updateCommand}`);
                yield (0, exec_1.exec)(`sudo ${installCommand}`);
            }
        }
    }
    let internalCacheHit = false;
    if (inputs.cache) {
        const cacheHitKey = yield cache.restoreCache([inputs.dir], inputs.cacheKey);
        if (cacheHitKey) {
            core.info(`Automatic cache hit with key "${cacheHitKey}"`);
            internalCacheHit = true;
        }
        else {
            core.info("Automatic cache miss, will cache this run");
        }
    }
    const getLatestCompatibleVersion = (version) => __awaiter(void 0, void 0, void 0, function* () {
        try {
            const { stdout } = yield (0, exec_1.getExecOutput)("git", [
                "ls-remote",
                "--tags",
                "--sort=-v:refname",
                "https://github.com/Kidev/aqtinstall.git",
            ]);
            const targetVersion = version.replace(/[=]/g, "").replace("*", "");
            const versions = stdout
                .split("\n")
                .map((line) => { var _a; return (_a = line.match(/refs\/tags\/v(\d+\.\d+\.\d+)$/)) === null || _a === void 0 ? void 0 : _a[1]; })
                .filter((v) => Boolean(v))
                .filter((v) => v.startsWith(targetVersion))
                .sort((a, b) => {
                // Return positive if b is greater, negative if a is greater
                return (0, compare_versions_1.compare)(a, b, "<") ? 1 : -1;
            });
            if (versions.length > 0) {
                return versions[0]; // Return the highest matching version
            }
            // Fallback to base version with .0 if no tags found
            return `${targetVersion}.0`;
        }
        catch (error) {
            core.warning(`Failed to fetch version tags: ${error}. Using fallback version.`);
            const targetVersion = version.replace(/[=]/g, "").replace("*", "");
            return `${targetVersion}.0`;
        }
    });
    // Then update the installation section:
    if (!internalCacheHit) {
        yield execPython("pip install", ["setuptools", "wheel", `"py7zr${inputs.py7zrVersion}"`]);
        if (inputs.aqtSource.length > 0) {
            // Allow custom source if specified
            yield execPython("pip install", [`"${inputs.aqtSource}"`]);
        }
        else if (inputs.aqtVersion.includes("*")) {
            // If it's a version range
            // Get the latest compatible version from Kidev's repository
            const version = yield getLatestCompatibleVersion(inputs.aqtVersion);
            core.info(`Installing Kidev's aqtinstall version ${version}`);
            yield execPython("pip install", [
                `"git+https://github.com/Kidev/aqtinstall.git@v${version}"`,
            ]);
        }
        else {
            // Fall back to standard aqtinstall for other versions
            yield execPython("pip install", [`"aqtinstall${inputs.aqtVersion}"`]);
        }
        const autodesktop = (yield isAutodesktopSupported()) ? ["--autodesktop"] : [];
        if (inputs.isInstallQtBinaries) {
            const qtArgs = [
                inputs.host,
                inputs.target,
                inputs.version,
                ...(inputs.arch ? [inputs.arch] : []),
                ...autodesktop,
                ...["--outputdir", inputs.dir],
                ...flaggedList("--modules", inputs.modules),
                ...flaggedList("--archives", inputs.archives),
            ];
            // Add WASM configuration for Qt 6.7+ with Kidev's fork
            if (inputs.wasm !== "none") {
                const usingKidevFork = inputs.aqtSource.includes("Kidev/aqtinstall") || inputs.aqtVersion === "==3.2.*";
                if (compareVersions(inputs.version, ">=", "6.7.0") && usingKidevFork) {
                    qtArgs.push("--wasm", inputs.wasm);
                }
                else if (!usingKidevFork) {
                    core.warning("WASM support requires Kidev's fork of aqtinstall (version 3.2.* or higher)");
                }
                else if (!compareVersions(inputs.version, ">=", "6.7.0")) {
                    core.warning("WASM support requires Qt 6.7.0 or higher");
                }
            }
            qtArgs.push(...inputs.extra);
            yield execPython("aqt install-qt", qtArgs);
        }
        const installSrcDocExamples = (flavor, archives, modules) => __awaiter(void 0, void 0, void 0, function* () {
            const qtArgs = [
                inputs.host,
                inputs.version,
                ...["--outputdir", inputs.dir],
                ...flaggedList("--archives", archives),
                ...flaggedList("--modules", modules),
                ...inputs.extra,
            ];
            yield execPython(`aqt install-${flavor}`, qtArgs);
        });
        if (inputs.src) {
            yield installSrcDocExamples("src", inputs.srcArchives, []);
        }
        if (inputs.doc) {
            yield installSrcDocExamples("doc", inputs.docArchives, inputs.docModules);
        }
        if (inputs.example) {
            yield installSrcDocExamples("example", inputs.exampleArchives, inputs.exampleModules);
        }
        for (const tool of inputs.tools) {
            const toolArgs = [
                inputs.host,
                inputs.target,
                tool,
                "--outputdir",
                inputs.dir,
                ...inputs.extra,
            ];
            yield execPython("aqt install-tool", toolArgs);
        }
    }
    if (!internalCacheHit && inputs.cache) {
        const cacheId = yield cache.saveCache([inputs.dir], inputs.cacheKey);
        core.info(`Automatic cache saved with id ${cacheId}`);
    }
    if (inputs.addToolsToPath && inputs.tools.length) {
        toolsPaths(inputs.dir).forEach(core.addPath);
    }
    if (inputs.tools.length && inputs.setEnv) {
        core.exportVariable("IQTA_TOOLS", path.resolve(inputs.dir, "Tools"));
    }
    if (inputs.isInstallQtBinaries) {
        const qtPath = locateQtArchDir(inputs.dir);
        core.setOutput("qtPath", qtPath);
        if (inputs.setEnv) {
            if (process.platform === "linux") {
                setOrAppendEnvVar("LD_LIBRARY_PATH", path.resolve(qtPath, "lib"));
            }
            if (process.platform !== "win32") {
                setOrAppendEnvVar("PKG_CONFIG_PATH", path.resolve(qtPath, "lib", "pkgconfig"));
            }
            if (compareVersions(inputs.version, "<", "6.0.0")) {
                core.exportVariable("Qt5_DIR", path.resolve(qtPath, "lib", "cmake"));
            }
            core.exportVariable("QT_ROOT_DIR", qtPath);
            core.exportVariable("QT_PLUGIN_PATH", path.resolve(qtPath, "plugins"));
            core.exportVariable("QML2_IMPORT_PATH", path.resolve(qtPath, "qml"));
            core.addPath(path.resolve(qtPath, "bin"));
        }
    }
});
void run()
    .catch((err) => {
    if (err instanceof Error) {
        core.setFailed(err);
    }
    else {
        core.setFailed(`unknown error: ${err}`);
    }
    process.exit(1);
})
    .then(() => {
    process.exit(0);
});

/** @type {import('jest').Config} */
export default {
    rootDir: ".",
    testEnvironment: "node",
    extensionsToTreatAsEsm: [".ts"],
    transform: {
        "^.+\\.ts$": [
            "@swc/jest",
            {
                jsc: {
                    parser: {
                        syntax: "typescript"
                    },
                    target: "es2020"
                }
            }
        ]
    },
    moduleDirectories: ["node_modules"],
    moduleNameMapper: {
        "^(\\.{1,2}/.*)\\.js$": "$1",
        "^downloadjs$": "<rootDir>/test/exporter/mocks/downloadjs.js",
        "^pretty$": "<rootDir>/test/exporter/mocks/pretty.js",
        "^fwtoolkit$": "<rootDir>/test/exporter/mocks/fwtoolkit.js",
        "^fwtoolkit/.*": "<rootDir>/test/exporter/mocks/fwtoolkit.js",
        "^@vivliostyle/print$": "<rootDir>/test/exporter/mocks/vivliostyle.js",
        "^mathlive$": "<rootDir>/test/exporter/mocks/mathlive.js",
        "^mathml2omml$": "<rootDir>/test/exporter/mocks/mathml2omml.js",
        "^bibliojson$": "<rootDir>/test/exporter/mocks/bibliojson.js",
        "^@fiduswriter/document/mathlive/opf_includes$":
            "<rootDir>/test/exporter/mocks/empty-module.js"
    },
    testMatch: ["<rootDir>/test/**/*.test.{js,ts}"],
    setupFiles: ["<rootDir>/test/setup.js"],
    moduleFileExtensions: ["ts", "js", "mjs", "json"]
}

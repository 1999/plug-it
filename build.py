import os
import sys
import json
import shutil
import re
import time


AVAILABLE_TARGETS = ("i18n", "rebuildConfig", "default", "templates", "watch", "release")

def main():
    if len(sys.argv) == 1:
        sys.argv.append("default")

    if (sys.argv[1] in AVAILABLE_TARGETS) == False:
        raise ValueError("Not available build target: " + sys.argv[1])

    globals()[sys.argv[1]]()

def i18n():
    """
    Builds messages.json files for all locales
    from i18n.json
    """
    i18nKeys = []
    localeData = {}

    # delete old built files
    shutil.rmtree("src/_locales", ignore_errors=True)

    with open("build/i18n.json", "r") as i18n:
        i18nDict = json.loads(i18n.read())

        # create new data
        for i18nKey, value in i18nDict.items():
            i18nKeys.append(i18nKey)

            for locale, data in value.items():
                if (locale in localeData) == False:
                    localeData[locale] = {}

                localeData[locale][i18nKey] = {"message": data}

        # write files
        for locale, data in localeData.items():
            localeDirPath = "src/_locales/" + locale
            os.makedirs(localeDirPath)

            with open(localeDirPath + "/messages.json", "w") as messages:
                messages.write(json.dumps(data, ensure_ascii=False))

def rebuildConfig(tweak_map={}, config_file_path="src/config.js"):
    """
    Builds config.js
    """
    from subprocess import check_output

    settingsFile = open("build/settings.json", "r")
    settings = json.loads(re.sub(r"\s/\*.+", "", settingsFile.read()))
    settingsFile.close()

    constantsFile = open("build/constants.json", "r")
    constants = json.loads(re.sub(r"\s/\*.+", "", constantsFile.read()))
    constantsFile.close()

    configChunks = {
        "default_settings_local": mergeChunks(settings["local"], tweak_map["default_settings_local"] if "default_settings_local" in tweak_map else {}),
        "default_settings_sync": mergeChunks(settings["sync"], tweak_map["default_settings_sync"] if "default_settings_sync" in tweak_map else {}),
        "constants": mergeChunks(constants, tweak_map["constants"] if "constants" in tweak_map else {}),
        "buildInfo": {
            "revision": check_output(["git", "rev-parse", "--verify", "HEAD"]).decode()[:10],
            "date": int(time.time())
        }
    }

    with open(config_file_path, mode='w', encoding='utf-8') as dest_file:
        dest_file.write('Config = ' + json.dumps(configChunks, sort_keys=True, indent=4))

def templates():
    """
    Combines templates into one file
    """
    import fnmatch

    combined = {}
    for file in os.listdir("templates"):
        if fnmatch.fnmatch(file, "*.mustache"):
            fileContents = []

            with open(os.path.join("templates", file)) as tplFile:
                for line in tplFile:
                    fileContents.append(line.strip())

            combined[re.sub(r".mustache", "", file)] = ''.join(fileContents)

    with open("src/sandbox/alltemplates.js", mode='w', encoding='utf-8') as tplFile:
        tplFile.write('Templates = ' + json.dumps(combined, sort_keys=True, indent=4))

def watch():
    templatesMDates = {}
    buildMDates = {}

    while True:
        filesNeedRebuild = []

        for file in os.listdir("templates"):
            filePath = os.path.join("templates", file)
            modifiedTimestamp = int(os.stat(filePath).st_mtime)
            if ((file in templatesMDates) == False or templatesMDates[file] != modifiedTimestamp):
                filesNeedRebuild.append(filePath)

            templatesMDates[file] = modifiedTimestamp

        for file in os.listdir("build"):
            filePath = os.path.join("build", file)
            modifiedTimestamp = int(os.stat(filePath).st_mtime)
            if ((file in buildMDates) == False or buildMDates[file] != modifiedTimestamp):
                filesNeedRebuild.append(filePath)

            buildMDates[file] = modifiedTimestamp

        if filesNeedRebuild:
            print("Rebuilding app data. New files: " + ", ".join(filesNeedRebuild))
            i18n()
            rebuildConfig()
            templates()

        time.sleep(1)

def release():
    """
    Builds release ZIP for Chrome Web Store
    """
    i18n()
    templates()

    if os.path.isdir("out") == False:
        os.mkdir("out")

    shutil.copytree("src", "out/src")

    # delete key from manifest
    with open("src/manifest.json", "r") as manifest:
        manifestData = json.loads(manifest.read())
        del manifestData["key"]
        manifestData["name"] = re.sub(r"\sDEV", "", manifestData["name"])
        manifestData["short_name"] = re.sub(r"\sDEV", "", manifestData["short_name"])

        with open("out/src/manifest.json", "w") as builtManifest:
            builtManifest.write(json.dumps(manifestData, indent=4))

    # rebuild config with release data
    with open("build/config.cws.json") as file:
        releaseConfig = json.loads(file.read())
        rebuildConfig(config_file_path="out/src/config.js", tweak_map=releaseConfig)

    # zip archive
    shutil.make_archive("release", "zip", root_dir="out/src")
    shutil.rmtree("out/src")
    shutil.move("release.zip", "out/release.zip")

def default():
    """
    Build i18n, templates and copy CPA library from submodule
    """
    i18n()
    rebuildConfig()
    templates()

    srcPath = "chrome-platform-analytics/google-analytics-bundle.js"
    dstPath = "src/lib/cpa.js"
    shutil.copyfile(srcPath, dstPath)


def mergeChunks(original, tweak):
    """
    Merges original and tweak dictionaries
    """
    output = original.copy()
    output.update(tweak)

    return output


if __name__ == "__main__":
    main()
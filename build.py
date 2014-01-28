import os
import sys
import json
import shutil

AVAILABLE_TARGETS = ("i18n", "default")

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

    with open("i18n.json", "r") as i18n:
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

def default():
    """
    Build i18n, templates and copy CPA library from submodule
    """
    i18n()

    srcPath = "chrome-platform-analytics/google-analytics-bundle.js"
    dstPath = "src/lib/cpa.js"
    shutil.copyfile(srcPath, dstPath)

if __name__ == "__main__":
    main()
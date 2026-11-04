pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "diwaliplay-native"

include(":app")
include(":core:model")
include(":core:game")
include(":core:tracking")
include(":core:render")
include(":core:audio")
include(":core:api")
include(":core:branding")
include(":core:kiosk")

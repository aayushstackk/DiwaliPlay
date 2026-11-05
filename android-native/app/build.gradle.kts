import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
}

// The web app's version (root package.json) is the release version; versionCode is bumped by hand per release.
val rootPackageVersion: String = file("../../package.json").readText()
    .let { Regex("\"version\"\\s*:\\s*\"([^\"]+)\"").find(it)?.groupValues?.get(1) }
    ?: error("No \"version\" in the root package.json")

// Release signing comes from the environment or Gradle properties (~/.gradle/gradle.properties); nothing is stored in the repo.
// Without a keystore the release build is still produced, but unsigned.
fun signingSetting(name: String): String? = providers.environmentVariable(name).orNull ?: providers.gradleProperty(name).orNull

android {
    namespace = "com.aayush.diwaliplay.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.aayush.diwaliplay.kiosk"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = rootPackageVersion
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // SoundPool loads assets through AssetFileDescriptor (openFd), which fails on compressed assets.
    // FLAC is already compressed, so keep it stored uncompressed in the APK.
    androidResources {
        noCompress += "flac"
        // MediaPipe memory-maps models/hand_landmarker.task, which needs it stored uncompressed.
        noCompress += "task"
    }

    signingConfigs {
        val keystorePath = signingSetting("DIWALI_KEYSTORE_PATH")
        if (keystorePath != null) {
            create("release") {
                storeFile = file(keystorePath)
                storePassword = signingSetting("DIWALI_KEYSTORE_PASSWORD")
                keyAlias = signingSetting("DIWALI_KEY_ALIAS")
                keyPassword = signingSetting("DIWALI_KEY_PASSWORD")
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
            signingConfigs.findByName("release")?.let { signingConfig = it }
            // Real displays only (both, since nothing here assumes which the WAF's is); debug keeps x86_64 for desktop emulators.
            ndk { abiFilters += listOf("arm64-v8a", "armeabi-v7a") }
        }
    }

    lint {
        // Errors fail the build; warnings are reported only.
        abortOnError = true
        warningsAsErrors = false
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    buildFeatures {
        compose = true
    }

    testOptions {
        // JVM tests touch android.util.Log through the view model's effects.
        unitTests.isReturnDefaultValues = true
    }

    // Fakes shared by the JVM tests and the instrumented PlayFlowTest.
    sourceSets {
        getByName("test").kotlin.srcDir("src/sharedTest/kotlin")
        getByName("androidTest").kotlin.srcDir("src/sharedTest/kotlin")
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    implementation(project(":core:model"))
    implementation(project(":core:api"))
    implementation(project(":core:game"))
    implementation(project(":core:tracking"))
    implementation(project(":core:render"))
    implementation(project(":core:audio"))
    implementation(project(":core:branding"))
    implementation(project(":core:kiosk"))

    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.zxing.core)
    implementation(libs.androidsvg)

    testImplementation(libs.junit)
    testImplementation(libs.truth)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.robolectric)

    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.truth)
    androidTestImplementation(platform(libs.compose.bom))
    androidTestImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)
}

import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.serialization)
}

android {
    namespace = "com.aayush.diwaliplay.audio"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
    }

    // Unit tests resolve against the real manifest and check every referenced file exists (Task 15 assets).
    sourceSets.getByName("test").resources.srcDir("../../app/src/main/assets")

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
    api(project(":core:model"))
    implementation(project(":core:branding"))
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.media3.exoplayer)
    testImplementation(project(":core:game"))
    testImplementation(libs.junit)
    testImplementation(libs.truth)
}

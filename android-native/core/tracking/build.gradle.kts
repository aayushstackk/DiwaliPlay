import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    alias(libs.plugins.android.library)
    alias(libs.plugins.kotlin.android)
}

android {
    namespace = "com.aayush.diwaliplay.tracking"
    compileSdk = 35

    defaultConfig {
        minSdk = 26
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    // MediaPipe memory-maps the model from assets; keep it stored uncompressed (test APK too).
    androidResources {
        noCompress += "task"
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

// The androidTest APK needs the hand model at the same asset path the app uses. Copy the single
// committed copy (app/src/main/assets/models/hand_landmarker.task) in as a generated asset dir.
abstract class CopyHandModelTask : DefaultTask() {
    @get:InputFile abstract val model: RegularFileProperty
    @get:OutputDirectory abstract val outputDir: DirectoryProperty

    @TaskAction
    fun copy() {
        val dir = outputDir.get().asFile.resolve("models")
        dir.mkdirs()
        model.get().asFile.copyTo(dir.resolve("hand_landmarker.task"), overwrite = true)
    }
}

val copyHandModelForTests = tasks.register<CopyHandModelTask>("copyHandModelForTests") {
    model.set(rootProject.layout.projectDirectory.file("app/src/main/assets/models/hand_landmarker.task"))
    outputDir.set(layout.buildDirectory.dir("generated/handModelAssets"))
}

androidComponents {
    onVariants { variant ->
        variant.androidTest?.sources?.assets?.addGeneratedSourceDirectory(
            copyHandModelForTests,
            CopyHandModelTask::outputDir,
        )
    }
}

dependencies {
    implementation(project(":core:model"))
    api(libs.kotlinx.coroutines.core)
    api(libs.camerax.view)
    implementation(libs.camerax.core)
    implementation(libs.camerax.camera2)
    implementation(libs.camerax.lifecycle)
    implementation(libs.mediapipe.tasks.vision)
    testImplementation(libs.kotlinx.serialization.json)
    testImplementation(libs.junit)
    testImplementation(libs.truth)
    androidTestImplementation(libs.androidx.test.runner)
    androidTestImplementation(libs.androidx.test.ext.junit)
    androidTestImplementation(libs.truth)
}

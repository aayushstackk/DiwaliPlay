# R8 rules for the release build. Each block says what it protects.

# MediaPipe tasks-vision: its native library (libmediapipe_tasks_vision_jni) finds Java classes, fields and methods by
# name through JNI, and its protobuf-lite messages are reflected on. R8 can't see either use.
-keep class com.google.mediapipe.** { *; }
-keep class com.google.protobuf.** { *; }

# The MediaPipe AAR bundles AutoValue's annotation processor, whose classes refer to the JDK's javax.lang.model, which
# Android doesn't have. Nothing at runtime calls them.
-dontwarn javax.lang.model.**
-dontwarn com.google.auto.value.**
-dontwarn autovalue.shaded.**

# The graph API in the MediaPipe AAR mentions proto classes that the AAR doesn't ship. The tasks API doesn't use them.
-dontwarn com.google.mediapipe.proto.**

# MediaPipe logs through Flogger, whose caller finder searches the stack for the logger's class by its original name.
# Renamed, it finds nothing, and Graph's static initializer dies with "no caller found on the stack".
-keep class com.google.common.flogger.** { *; }
-dontwarn com.google.common.flogger.**

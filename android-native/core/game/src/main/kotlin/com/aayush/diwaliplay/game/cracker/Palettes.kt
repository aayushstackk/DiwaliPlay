package com.aayush.diwaliplay.game.cracker

/** Festive palettes copied from COLOR_PALETTES in src/utils/crackerEngine.ts, parsed once to ARGB. */
internal object Palettes {
    /** Opaque ARGB from a `#RRGGBB` string. */
    fun parse(hex: String): Int = (0xFF000000L or hex.removePrefix("#").toLong(16)).toInt()

    private fun pal(vararg hex: String) = IntArray(hex.size) { parse(hex[it]) }

    val gold = pal("#FFFBEB", "#FEF08A", "#FDE047", "#F59E0B", "#D97706")
    val saffron = pal("#FFF7ED", "#FFEDD5", "#FB923C", "#EA580C", "#C2410C")
    val ruby = pal("#FFF1F2", "#FECDD3", "#FB7185", "#F43F5E", "#E11D48")
    val emerald = pal("#ECFDF5", "#A7F3D0", "#34D399", "#10B981", "#059669")
    val royal = pal("#FAF5FF", "#E9D5FF", "#C084FC", "#A855F7", "#7E22CE")
    val electric = pal("#F0FDF4", "#6EE7B7", "#38BDF8", "#818CF8", "#C084FC")

    /** ALL_PALETTE_NAMES order (matters for seeded index picks). */
    val all: List<IntArray> = listOf(gold, saffron, ruby, emerald, royal, electric)

    /** ['ruby', 'saffron', 'gold'] pick list used by the radial bomb. */
    val bomb: List<IntArray> = listOf(ruby, saffron, gold)

    val DEFAULT_PARTICLE_COLOR = parse("#F59E0B")
    val RING_DEFAULT_COLOR = parse("#FEF08A")
    val BOMB_DEFAULT_COLOR = parse("#F59E0B")

    val WHITE = parse("#FFFFFF")
    val FLOWER_RING = parse("#FDE047")
    val AMBER = parse("#F59E0B")
    val ROSE = parse("#F43F5E")
    val SKY = parse("#38BDF8")
    val VIOLET = parse("#C084FC")
    val RED = parse("#EF4444")

    val penaltyAccents = pal("#EF4444", "#DC2626", "#991B1B", "#F87171", "#FEF2F2")
    val penaltyEmbers = pal("#FCA5A5", "#F87171", "#4B5563")
    val emberColors = pal("#FED7AA", "#FDE047", "#E2E8F0", "#FFFFFF")
    val bombSparkTail = pal("#FFFFFF", "#FEF08A", "#FDE047", "#F59E0B")
}

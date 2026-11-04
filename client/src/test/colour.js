// WCAG contrast between two #rrggbb colours: 4.5 is the minimum for text, 3 for the outline of a control

const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))

    return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

export const contrast = (a, b) => {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)

    return (lighter + 0.05) / (darker + 0.05)
}

import "@testing-library/jest-dom/vitest"
import { afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

// Unmount whatever a test rendered so the next test starts from an empty page
afterEach(() => cleanup())

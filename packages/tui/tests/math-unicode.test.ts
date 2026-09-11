// LaTeX → Unicode 近似单测（MT2，TUI.md §6 规则表逐条 + 降级路径）
import { describe, expect, it } from 'vitest'
import { latexToUnicode } from '../src/math-unicode'

describe('latexToUnicode（可表达集）', () => {
  it('上下标', () => {
    expect(latexToUnicode('e=mc^2')).toBe('e=mc²')
    expect(latexToUnicode('x^{2n}')).toBe('x²ⁿ')
    expect(latexToUnicode('a_1')).toBe('a₁')
    expect(latexToUnicode('x_{ij}')).toBe('xᵢⱼ')
  })

  it('组合上下标（∑ᵢ₌₁ⁿ）', () => {
    expect(latexToUnicode('\\sum_{i=1}^n i')).toBe('∑ᵢ₌₁ⁿ i')
  })

  it('根号与分数', () => {
    expect(latexToUnicode('\\sqrt{x}')).toBe('√(x)')
    expect(latexToUnicode('\\frac{a}{b}')).toBe('a/b')
    expect(latexToUnicode('\\frac{n(n+1)}{2}')).toBe('n(n+1)/2')
    expect(latexToUnicode('\\sqrt{\\frac{1}{2}}')).toBe('√(1/2)')
  })

  it('符号与希腊字母', () => {
    expect(latexToUnicode('\\pi r^2')).toBe('π r²')
    expect(latexToUnicode('\\alpha + \\beta')).toBe('α + β')
    expect(latexToUnicode('a \\leq b \\neq c')).toBe('a ≤ b ≠ c')
    expect(latexToUnicode('x \\to \\infty')).toBe('x → ∞')
  })

  it('\\left/\\right 剥除', () => {
    expect(latexToUnicode('\\left(a+b\\right)^2')).toBe('(a+b)²')
  })

  it('脚本组平排回退（m3 样例三大公式全覆盖）', () => {
    // 脚本组缺映射字符 → ^(...)/_(...) 平排，而非放弃整条公式
    expect(latexToUnicode('e^{i\\pi} + 1 = 0')).toBe('e^(iπ) + 1 = 0')
    expect(latexToUnicode('\\int_0^\\infty e^{-x^2} \\, dx = \\frac{\\sqrt{\\pi}}{2}')).toBe(
      '∫₀^(∞) e^(-x²) dx = √(π)/2',
    )
    expect(latexToUnicode('\\sum_{n=1}^{\\infty} \\frac{1}{n^2} = \\frac{\\pi^2}{6}')).toBe(
      '∑ₙ₌₁^(∞) 1/n² = π²/6',
    )
  })
})

describe('latexToUnicode（不可表达 → null 降级源码）', () => {
  it('环境/矩阵', () => {
    expect(latexToUnicode('\\begin{pmatrix}a&b\\\\c&d\\end{pmatrix}')).toBeNull()
  })

  it('未知命令', () => {
    expect(latexToUnicode('\\foobar{x}')).toBeNull()
  })

  it('单字符脚本无映射（组形式才平排回退）', () => {
    expect(latexToUnicode('x_@')).toBeNull()
  })

  it('嵌套分数（线性化歧义）', () => {
    expect(latexToUnicode('\\frac{\\frac{a}{b}}{c}')).toBeNull()
  })

  it('空输入', () => {
    expect(latexToUnicode('')).toBeNull()
    expect(latexToUnicode('   ')).toBeNull()
  })
})

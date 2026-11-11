import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('App', () => {
  it('renders the Shortlist brand on the start page', async () => {
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    // The brand shows twice: on the wide-screen rail and above the form on phones.
    expect(screen.getAllByText('Shortlist').length).toBeGreaterThan(0)
  })
})

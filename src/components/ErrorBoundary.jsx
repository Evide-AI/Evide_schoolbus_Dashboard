import { Component } from 'react';

// Shows a readable message instead of a blank white screen if a page crashes.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Page crashed:', error, info?.componentStack);
  }

  componentDidUpdate(prevProps) {
    // Clear the error when the user switches to another page.
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="empty-state card">
        <h3>This page couldn't load</h3>
        <p className="muted">{String(this.state.error?.message || this.state.error)}</p>
        <button className="btn btn-secondary" onClick={() => window.location.reload()}>Reload page</button>
      </div>
    );
  }
}

const sanitizeInput = require('../middleware/sanitize');

describe('Sanitize Input Middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {}, query: {}, params: {} };
    res = {};
    next = jest.fn();
  });

  it('should pass through clean input unchanged', () => {
    req.body = { name: 'John Doe', email: 'john@example.com' };
    sanitizeInput(req, res, next);
    expect(req.body.name).toBe('John Doe');
    expect(req.body.email).toBe('john@example.com');
    expect(next).toHaveBeenCalled();
  });

  it('should remove script tags from input', () => {
    req.body = { name: '<script>alert("xss")</script>John' };
    sanitizeInput(req, res, next);
    expect(req.body.name).not.toContain('<script>');
    expect(next).toHaveBeenCalled();
  });

  it('should remove javascript: URLs', () => {
    req.body = { url: 'javascript:alert(1)' };
    sanitizeInput(req, res, next);
    expect(req.body.url).not.toContain('javascript:');
    expect(next).toHaveBeenCalled();
  });

  it('should handle arrays in input', () => {
    req.body = { items: ['<script>alert(1)</script>', 'clean item'] };
    sanitizeInput(req, res, next);
    expect(req.body.items[0]).not.toContain('<script>');
    expect(req.body.items[1]).toBe('clean item');
    expect(next).toHaveBeenCalled();
  });

  it('should handle nested objects', () => {
    req.body = {
      user: {
        name: 'John',
        profile: {
          bio: '<script>xss</script>Clean bio'
        }
      }
    };
    sanitizeInput(req, res, next);
    expect(req.body.user.profile.bio).not.toContain('<script>');
    expect(next).toHaveBeenCalled();
  });
});

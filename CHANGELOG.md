# Changelog

## Unreleased

- Security: State-changing API requests (POST/PATCH/PUT/DELETE) now reject cookie-only authentication and require Bearer-token auth when a session cookie is present. Cookie auth remains accepted for read-only GET requests.
- Security: Admin is no longer an implicit role-check bypass; endpoints must include `admin` explicitly in their allowed roles.
- Security: Voice endpoints now require authentication and enforce a per-user 10 requests/minute limit.

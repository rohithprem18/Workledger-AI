-- Create token blacklist table for logout functionality
CREATE TABLE token_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    token_jti VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(100) NOT NULL,
    blacklisted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indices for efficient queries and cleanup
CREATE INDEX idx_token_blacklist_expires ON token_blacklist(expires_at);
CREATE INDEX idx_token_blacklist_username ON token_blacklist(username);
CREATE INDEX idx_token_blacklist_jti ON token_blacklist(token_jti);

-- Add comment
COMMENT ON TABLE token_blacklist IS 'Stores revoked/blacklisted JWT tokens for logout functionality';
COMMENT ON COLUMN token_blacklist.token_jti IS 'JWT ID (jti claim) - unique identifier for each token';
COMMENT ON COLUMN token_blacklist.expires_at IS 'When this blacklist entry expires (matches JWT exp claim)';

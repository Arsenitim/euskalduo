<?php

declare(strict_types=1);

namespace App\Security;

/**
 * Admin credentials come from the environment (ADMIN_PASSWORD or
 * ADMIN_PASSWORD_HASH). When neither is set, a random password is generated
 * once on first start, printed to the container log, and only its hash is
 * kept in the data volume. There is no built-in default password.
 */
final class AdminCredentials
{
    private const FILE = 'admin-credentials.json';

    public function __construct(
        private readonly string $dataDir,
        private readonly string $username,
        #[\SensitiveParameter] private readonly string $plainPassword,
        #[\SensitiveParameter] private readonly string $passwordHash,
    ) {
    }

    public function username(): string
    {
        return '' !== $this->username ? $this->username : 'admin';
    }

    public function verify(string $username, #[\SensitiveParameter] string $password): bool
    {
        $hash = $this->currentHash();
        if (null === $hash) {
            return false;
        }
        // Always run password_verify so timing does not reveal a wrong username.
        $passwordOk = password_verify($password, $hash);

        return hash_equals($this->username(), $username) && $passwordOk;
    }

    /**
     * Generates and stores credentials if none are configured.
     *
     * @return string|null the new plain password (to show once), or null
     */
    public function ensureConfigured(): ?string
    {
        if (null !== $this->currentHash()) {
            return null;
        }
        $password = rtrim(strtr(base64_encode(random_bytes(15)), '+/', 'Kx'), '=');
        $file = $this->dataDir.'/'.self::FILE;
        file_put_contents($file, json_encode(['hash' => password_hash($password, \PASSWORD_DEFAULT)], \JSON_THROW_ON_ERROR));
        chmod($file, 0600);

        return $password;
    }

    public function source(): string
    {
        return match (true) {
            '' !== $this->passwordHash => 'ADMIN_PASSWORD_HASH',
            '' !== $this->plainPassword => 'ADMIN_PASSWORD',
            is_file($this->dataDir.'/'.self::FILE) => 'generated',
            default => 'none',
        };
    }

    public function isWeakEnvPassword(): bool
    {
        return '' === $this->passwordHash && '' !== $this->plainPassword && mb_strlen($this->plainPassword) < 12;
    }

    private function currentHash(): ?string
    {
        if ('' !== $this->passwordHash) {
            return $this->passwordHash;
        }
        if ('' !== $this->plainPassword) {
            return password_hash($this->plainPassword, \PASSWORD_DEFAULT, ['cost' => 10]);
        }
        $file = $this->dataDir.'/'.self::FILE;
        if (!is_file($file)) {
            return null;
        }
        $data = json_decode((string) file_get_contents($file), true);

        return \is_array($data) && \is_string($data['hash'] ?? null) ? $data['hash'] : null;
    }
}

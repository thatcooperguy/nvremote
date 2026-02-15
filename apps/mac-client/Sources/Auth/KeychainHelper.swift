// KeychainHelper.swift — Secure token storage via macOS Keychain
// NVRemote macOS Client

import Foundation
import Security

/// Thread-safe wrapper around the macOS Keychain for storing and retrieving
/// authentication tokens. All items are stored under the NVRemote service name
/// with kSecClassGenericPassword.
final class KeychainHelper: Sendable {
    /// Shared singleton instance.
    static let shared = KeychainHelper()

    /// The Keychain service name under which all NVRemote tokens are stored.
    private let service = "com.nvremote.mac-client"

    private init() {}

    // MARK: - Public API

    /// Save a string value to the Keychain under the given key.
    /// Overwrites any existing value for the same key.
    /// - Parameters:
    ///   - value: The string to store (e.g. an OAuth token).
    ///   - key: The account identifier within the service.
    /// - Returns: `true` if the save succeeded.
    @discardableResult
    func save(_ value: String, forKey key: String) -> Bool {
        guard let data = value.data(using: .utf8) else { return false }
        return save(data, forKey: key)
    }

    /// Save raw data to the Keychain under the given key.
    @discardableResult
    func save(_ data: Data, forKey key: String) -> Bool {
        // Delete any existing item first to avoid errSecDuplicateItem.
        delete(forKey: key)

        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String:  service,
            kSecAttrAccount as String:  key,
            kSecValueData as String:    data,
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
        ]

        let status = SecItemAdd(query as CFDictionary, nil)
        if status != errSecSuccess {
            logKeychainError("save", key: key, status: status)
        }
        return status == errSecSuccess
    }

    /// Load a string value from the Keychain for the given key.
    /// - Returns: The stored string, or `nil` if not found or on error.
    func loadString(forKey key: String) -> String? {
        guard let data = loadData(forKey: key) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    /// Load raw data from the Keychain for the given key.
    func loadData(forKey key: String) -> Data? {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String:  service,
            kSecAttrAccount as String:  key,
            kSecReturnData as String:   true,
            kSecMatchLimit as String:   kSecMatchLimitOne,
        ]

        var result: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &result)

        if status == errSecItemNotFound {
            return nil
        }
        if status != errSecSuccess {
            logKeychainError("load", key: key, status: status)
            return nil
        }
        return result as? Data
    }

    /// Delete the value stored under the given key.
    /// - Returns: `true` if the item was deleted (or did not exist).
    @discardableResult
    func delete(forKey key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String:  service,
            kSecAttrAccount as String:  key,
        ]

        let status = SecItemDelete(query as CFDictionary)
        if status != errSecSuccess && status != errSecItemNotFound {
            logKeychainError("delete", key: key, status: status)
            return false
        }
        return true
    }

    /// Delete all NVRemote items from the Keychain.
    @discardableResult
    func deleteAll() -> Bool {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String:  service,
        ]

        let status = SecItemDelete(query as CFDictionary)
        return status == errSecSuccess || status == errSecItemNotFound
    }

    /// Check whether a value exists for the given key without loading it.
    func exists(forKey key: String) -> Bool {
        let query: [String: Any] = [
            kSecClass as String:       kSecClassGenericPassword,
            kSecAttrService as String:  service,
            kSecAttrAccount as String:  key,
            kSecReturnData as String:   false,
        ]

        let status = SecItemCopyMatching(query as CFDictionary, nil)
        return status == errSecSuccess
    }

    // MARK: - Private

    private func logKeychainError(_ operation: String, key: String, status: OSStatus) {
        let message = SecCopyErrorMessageString(status, nil) as String? ?? "unknown"
        print("[KeychainHelper] \(operation) failed for key=\(key): \(status) (\(message))")
    }
}

// MARK: - Well-Known Keys

extension KeychainHelper {
    /// Keychain key for the Google OAuth access token.
    static let accessTokenKey = "google_access_token"

    /// Keychain key for the Google OAuth refresh token.
    static let refreshTokenKey = "google_refresh_token"

    /// Keychain key for the Google OAuth ID token (JWT).
    static let idTokenKey = "google_id_token"

    /// Keychain key for the token expiration date (ISO 8601 string).
    static let tokenExpiryKey = "token_expiry"

    /// Keychain key for the authenticated user's email.
    static let userEmailKey = "user_email"

    /// Keychain key for the authenticated user's display name.
    static let userNameKey = "user_name"
}

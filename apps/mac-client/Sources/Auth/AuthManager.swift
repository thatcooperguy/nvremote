// AuthManager.swift — Google Sign-In + token management via ASWebAuthenticationSession
// CrazyStream macOS Client

import Foundation
import AuthenticationServices
import SwiftUI

/// Represents the currently authenticated user.
struct AuthUser: Sendable, Equatable {
    let email: String
    let displayName: String
    let idToken: String
    let accessToken: String
}

/// Observable authentication manager. Handles Google OAuth 2.0 login using
/// ASWebAuthenticationSession, token refresh, and secure Keychain persistence.
@MainActor
final class AuthManager: NSObject, ObservableObject {
    // MARK: - Published State

    @Published private(set) var isAuthenticated = false
    @Published private(set) var user: AuthUser?
    @Published private(set) var isLoading = false
    @Published var errorMessage: String?

    // MARK: - OAuth Configuration

    /// Google OAuth 2.0 client ID. In production this should come from a config file
    /// or environment variable. For development, set via Config.swift.
    var clientID: String = ""

    /// The redirect URI scheme registered for this app.
    private let redirectScheme = "com.crazystream.mac-client"
    private let redirectURI = "com.crazystream.mac-client:/oauth2callback"

    /// Google OAuth endpoints.
    private let authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth"
    private let tokenEndpoint = "https://oauth2.googleapis.com/token"
    private let userInfoEndpoint = "https://www.googleapis.com/oauth2/v2/userinfo"

    /// OAuth scopes we request.
    private let scopes = "openid email profile"

    /// PKCE code verifier (generated fresh per login attempt).
    private var codeVerifier: String?

    // MARK: - Initialization

    override init() {
        super.init()
        restoreSession()
    }

    // MARK: - Public API

    /// Initiate Google Sign-In via ASWebAuthenticationSession.
    func signIn() {
        guard !clientID.isEmpty else {
            errorMessage = "OAuth client ID not configured. Set it in Config.swift."
            return
        }

        isLoading = true
        errorMessage = nil

        // Generate PKCE parameters
        let verifier = generateCodeVerifier()
        codeVerifier = verifier
        let challenge = generateCodeChallenge(from: verifier)

        // Build the authorization URL
        var components = URLComponents(string: authorizationEndpoint)!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientID),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "scope", value: scopes),
            URLQueryItem(name: "code_challenge", value: challenge),
            URLQueryItem(name: "code_challenge_method", value: "S256"),
            URLQueryItem(name: "access_type", value: "offline"),
            URLQueryItem(name: "prompt", value: "consent"),
        ]

        guard let authURL = components.url else {
            isLoading = false
            errorMessage = "Failed to construct authorization URL."
            return
        }

        let session = ASWebAuthenticationSession(
            url: authURL,
            callbackURLScheme: redirectScheme
        ) { [weak self] callbackURL, error in
            Task { @MainActor in
                guard let self else { return }
                self.isLoading = false

                if let error {
                    if (error as NSError).code == ASWebAuthenticationSessionError.canceledLogin.rawValue {
                        // User cancelled — not an error
                        return
                    }
                    self.errorMessage = "Sign-in failed: \(error.localizedDescription)"
                    return
                }

                guard let callbackURL,
                      let code = URLComponents(url: callbackURL, resolvingAgainstBaseURL: false)?
                        .queryItems?.first(where: { $0.name == "code" })?.value
                else {
                    self.errorMessage = "No authorization code received."
                    return
                }

                await self.exchangeCodeForTokens(code: code)
            }
        }

        // Present the authentication session.
        // On macOS 13+, presentationContextProvider is set to show in the key window.
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        session.start()
    }

    /// Sign out: clear tokens and reset state.
    func signOut() {
        user = nil
        isAuthenticated = false
        KeychainHelper.shared.deleteAll()
    }

    /// Attempt to refresh the access token using the stored refresh token.
    func refreshTokenIfNeeded() async {
        guard let refreshToken = KeychainHelper.shared.loadString(forKey: KeychainHelper.refreshTokenKey) else {
            signOut()
            return
        }

        // Check if the current token is still valid
        if let expiryString = KeychainHelper.shared.loadString(forKey: KeychainHelper.tokenExpiryKey),
           let expiryDate = ISO8601DateFormatter().date(from: expiryString),
           expiryDate > Date().addingTimeInterval(60) {
            // Token still valid for at least 60 more seconds
            return
        }

        await refreshAccessToken(refreshToken: refreshToken)
    }

    /// Get the current valid access token, refreshing if necessary.
    func getValidAccessToken() async -> String? {
        await refreshTokenIfNeeded()
        return KeychainHelper.shared.loadString(forKey: KeychainHelper.accessTokenKey)
    }

    // MARK: - Token Exchange

    /// Exchange the authorization code for access + refresh tokens.
    private func exchangeCodeForTokens(code: String) async {
        guard let verifier = codeVerifier else {
            errorMessage = "Missing PKCE code verifier."
            return
        }

        isLoading = true

        let params: [String: String] = [
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirectURI,
            "client_id": clientID,
            "code_verifier": verifier,
        ]

        do {
            let tokenResponse = try await postFormRequest(url: tokenEndpoint, params: params)
            try await processTokenResponse(tokenResponse)
        } catch {
            errorMessage = "Token exchange failed: \(error.localizedDescription)"
            isLoading = false
        }
    }

    /// Refresh the access token using a refresh token.
    private func refreshAccessToken(refreshToken: String) async {
        let params: [String: String] = [
            "grant_type": "refresh_token",
            "refresh_token": refreshToken,
            "client_id": clientID,
        ]

        do {
            let tokenResponse = try await postFormRequest(url: tokenEndpoint, params: params)
            try await processTokenResponse(tokenResponse)
        } catch {
            // Refresh failed — force re-login
            signOut()
        }
    }

    /// Process the JSON token response: extract tokens, save to Keychain, fetch user info.
    private func processTokenResponse(_ json: [String: Any]) async throws {
        guard let accessToken = json["access_token"] as? String else {
            throw AuthError.missingToken("access_token")
        }

        let idToken = json["id_token"] as? String ?? ""
        let refreshToken = json["refresh_token"] as? String
        let expiresIn = json["expires_in"] as? Int ?? 3600

        // Save tokens to Keychain
        KeychainHelper.shared.save(accessToken, forKey: KeychainHelper.accessTokenKey)
        if !idToken.isEmpty {
            KeychainHelper.shared.save(idToken, forKey: KeychainHelper.idTokenKey)
        }
        if let refreshToken {
            KeychainHelper.shared.save(refreshToken, forKey: KeychainHelper.refreshTokenKey)
        }

        let expiryDate = Date().addingTimeInterval(TimeInterval(expiresIn))
        let expiryString = ISO8601DateFormatter().string(from: expiryDate)
        KeychainHelper.shared.save(expiryString, forKey: KeychainHelper.tokenExpiryKey)

        // Fetch user profile
        let userInfo = try await fetchUserInfo(accessToken: accessToken)
        let email = userInfo["email"] as? String ?? "unknown"
        let name = userInfo["name"] as? String ?? email

        KeychainHelper.shared.save(email, forKey: KeychainHelper.userEmailKey)
        KeychainHelper.shared.save(name, forKey: KeychainHelper.userNameKey)

        let authenticatedUser = AuthUser(
            email: email,
            displayName: name,
            idToken: idToken,
            accessToken: accessToken
        )

        self.user = authenticatedUser
        self.isAuthenticated = true
        self.isLoading = false
        self.codeVerifier = nil
    }

    /// Fetch Google user profile info.
    private func fetchUserInfo(accessToken: String) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: userInfoEndpoint)!)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw AuthError.userInfoFailed
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AuthError.invalidResponse
        }
        return json
    }

    // MARK: - Session Restore

    /// Restore a previous session from Keychain on launch.
    private func restoreSession() {
        guard let accessToken = KeychainHelper.shared.loadString(forKey: KeychainHelper.accessTokenKey),
              let email = KeychainHelper.shared.loadString(forKey: KeychainHelper.userEmailKey)
        else {
            return
        }

        let name = KeychainHelper.shared.loadString(forKey: KeychainHelper.userNameKey) ?? email
        let idToken = KeychainHelper.shared.loadString(forKey: KeychainHelper.idTokenKey) ?? ""

        self.user = AuthUser(
            email: email,
            displayName: name,
            idToken: idToken,
            accessToken: accessToken
        )
        self.isAuthenticated = true
    }

    // MARK: - PKCE Helpers

    /// Generate a random 43-128 character code verifier (RFC 7636).
    private func generateCodeVerifier() -> String {
        var bytes = [UInt8](repeating: 0, count: 32)
        _ = SecRandomCopyBytes(kSecRandomDefault, bytes.count, &bytes)
        return Data(bytes)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    /// Derive the S256 code challenge from the verifier.
    private func generateCodeChallenge(from verifier: String) -> String {
        guard let data = verifier.data(using: .ascii) else { return "" }
        var hash = [UInt8](repeating: 0, count: 32)
        data.withUnsafeBytes { buffer in
            _ = CC_SHA256(buffer.baseAddress, CC_LONG(data.count), &hash)
        }
        return Data(hash)
            .base64EncodedString()
            .replacingOccurrences(of: "+", with: "-")
            .replacingOccurrences(of: "/", with: "_")
            .replacingOccurrences(of: "=", with: "")
    }

    // MARK: - HTTP Helpers

    /// Send an application/x-www-form-urlencoded POST request and parse JSON response.
    private func postFormRequest(url: String, params: [String: String]) async throws -> [String: Any] {
        var request = URLRequest(url: URL(string: url)!)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        let body = params.map { "\($0.key)=\($0.value.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? $0.value)" }
            .joined(separator: "&")
        request.httpBody = body.data(using: .utf8)

        let (data, response) = try await URLSession.shared.data(for: request)
        guard let httpResponse = response as? HTTPURLResponse else {
            throw AuthError.invalidResponse
        }

        guard httpResponse.statusCode == 200 else {
            let responseBody = String(data: data, encoding: .utf8) ?? "no body"
            throw AuthError.httpError(httpResponse.statusCode, responseBody)
        }

        guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            throw AuthError.invalidResponse
        }

        return json
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension AuthManager: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        NSApp.keyWindow ?? NSApp.windows.first ?? ASPresentationAnchor()
    }
}

// MARK: - CommonCrypto Bridge

// Swift has no built-in SHA256 in Foundation on macOS 13 without CryptoKit.
// We use CC_SHA256 from CommonCrypto via a bridging approach.
import CommonCrypto

// MARK: - Auth Errors

enum AuthError: LocalizedError {
    case missingToken(String)
    case userInfoFailed
    case invalidResponse
    case httpError(Int, String)

    var errorDescription: String? {
        switch self {
        case .missingToken(let name):
            return "Missing \(name) in token response."
        case .userInfoFailed:
            return "Failed to fetch user profile."
        case .invalidResponse:
            return "Invalid server response."
        case .httpError(let code, let body):
            return "HTTP \(code): \(body)"
        }
    }
}

import Capacitor
import Foundation
import GameKit

/// Minimal Game Center bridge for Grain: sign in, submit the best score, report achievements,
/// show the leaderboard. Kept in-repo (copied into ios/App/App by scripts/ios-setup.mjs) instead of
/// depending on a third-party plugin.
@objc(GrainGameCenterPlugin)
public class GrainGameCenterPlugin: CAPPlugin, CAPBridgedPlugin, GKGameCenterControllerDelegate {
    public let identifier = "GrainGameCenterPlugin"
    public let jsName = "GrainGameCenter"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "signIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "submitScore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "unlockAchievement", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showLeaderboard", returnType: CAPPluginReturnPromise),
    ]

    @objc func signIn(_ call: CAPPluginCall) {
        let player = GKLocalPlayer.local
        if player.isAuthenticated {
            call.resolve(["authenticated": true])
            return
        }
        var answered = false
        player.authenticateHandler = { [weak self] viewController, _ in
            if let viewController = viewController {
                // Game Center wants to show its sign-in sheet
                DispatchQueue.main.async {
                    self?.bridge?.viewController?.present(viewController, animated: true)
                }
                return
            }
            if !answered {
                answered = true
                call.resolve(["authenticated": player.isAuthenticated])
            }
        }
    }

    @objc func submitScore(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated, let id = call.getString("leaderboardId") else {
            call.resolve()
            return
        }
        let score = call.getInt("score") ?? 0
        GKLeaderboard.submitScore(score, context: 0, player: GKLocalPlayer.local, leaderboardIDs: [id]) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func unlockAchievement(_ call: CAPPluginCall) {
        guard GKLocalPlayer.local.isAuthenticated, let id = call.getString("achievementId") else {
            call.resolve()
            return
        }
        let achievement = GKAchievement(identifier: id)
        achievement.percentComplete = 100
        // the game shows its own banner
        achievement.showsCompletionBanner = false
        GKAchievement.report([achievement]) { error in
            if let error = error {
                call.reject(error.localizedDescription)
            } else {
                call.resolve()
            }
        }
    }

    @objc func showLeaderboard(_ call: CAPPluginCall) {
        guard let id = call.getString("leaderboardId") else {
            call.reject("leaderboardId missing")
            return
        }
        DispatchQueue.main.async {
            let viewController = GKGameCenterViewController(leaderboardID: id, playerScope: .global, timeScope: .allTime)
            viewController.gameCenterDelegate = self
            self.bridge?.viewController?.present(viewController, animated: true) {
                call.resolve()
            }
        }
    }

    public func gameCenterViewControllerDidFinish(_ gameCenterViewController: GKGameCenterViewController) {
        gameCenterViewController.dismiss(animated: true)
    }
}

import Capacitor
import UIKit

/// The app's web view controller: registers Grain's in-repo native plugins.
class GrainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(GrainGameCenterPlugin())
    }
}

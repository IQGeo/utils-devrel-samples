import myw from 'myWorld-client';

/**
 * @class Provides toolbar button for feature mode plugins and child classes
 * @extends {PluginButton}
 */
class FeatureModePluginButton extends myw.PluginButton {
    static {
        this.prototype.id = 'a-edit-mode';
        this.prototype.titleMsg = 'toolbar_msg'; //for automated tests
        this.prototype.imgSrc = '';
    }

    initUI() {
        this.setState();
        this.listenTo(this.owner, 'changed-state', this.setState);
    } // subclass to specify this

    setState() {
        this.$el.toggleClass('inactive', !this.owner.active);
        this.$el.toggleClass('active', this.owner.enabled);
    }

    action() {
        if (this.$el.hasClass('inactive')) return;
        this.owner.toggle();
    }
}

export default FeatureModePluginButton;

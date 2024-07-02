// Copyright: IQGeo Limited 2010-2023
import myw from 'myWorld-client';

/**
 * Superclass for design rules
 */
class designRule extends myw.MywClass {
    static {
        this.prototype.messageGroup = 'DesignRule';

        // Defines the type of rule
        // Should be subclassed and unique for each rule class
        this.prototype.type = 'generic';

        // What design types does this rule apply to
        // Special value of true means applies to all
        this.prototype.designTypes = [true];

        // What design states does this rule apply to
        // Special value of true means applies to all
        this.prototype.designStates = [true];
    }

    constructor(engine, bounds = null, deltaOnly = false) {
        super();
        this.engine = engine;
        this.bounds = bounds;
        this.deltaOnly = deltaOnly;

        this.stop = false;
    }

    /**
     * Run the rule, logging errors with this.engine
     * Subclass for specific rule classes
     */
    async run() {}

    /**
     * Cancel the rule
     * The specific rule class should check for this.stop at appropriate times and finish processing
     */
    cancel() {
        this.stop = true;
    }

    /**
     * Is this rule applicable to the specified design type and state
     */
    applicableForDelta(delta) {
        const deltaType = delta.properties.type;
        const deltaState = delta.properties.status;

        if (this.designTypes.indexOf(deltaType) == -1 && this.designTypes.indexOf(true) == -1)
            return false;
        if (this.designStates.indexOf(deltaState) == -1 && this.designStates.indexOf(true) == -1)
            return false;

        return true;
    }

    /**
     * Return a short string for the rule type
     * Subclass or define message for type
     */
    typeDesc() {
        return this.msg(this.type);
    }
}

export default designRule;

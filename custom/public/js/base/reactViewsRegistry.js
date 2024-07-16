/**
 * Object used for registering react components
 */
export default {
    registerViews: function (views) {
        if (!this.reactViews) this.reactViews = {};
        views.forEach(view => {
            const { name, component, functions, hooks } = view;
            this.reactViews[name] = { component: component, functions: {}, hooks: {} };
            if (hooks)
                Object.keys(hooks).forEach(hook => {
                    this.reactViews[name].hooks[hook] = hooks[hook];
                });
            if (functions)
                Object.keys(functions).forEach(controlFunction => {
                    this.reactViews[name].functions[controlFunction] = functions[controlFunction];
                });
        });
    }
};

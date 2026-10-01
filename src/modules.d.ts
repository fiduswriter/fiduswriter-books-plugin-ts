declare module "js-beautify" {
    function jsBeautify(source: string, options?: Record<string, unknown>): string
    namespace jsBeautify {
        function html(source: string, options?: Record<string, unknown>): string
    }
    export default jsBeautify
}

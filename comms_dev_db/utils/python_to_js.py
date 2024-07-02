import sys, re, ast


class Converter:
    """
    Util to convert a Python file to JavaScript syntax

    Includes conversion of various mywcom-specific elements"""

    def __init__(self, strm, trace_level=0):
        """
        Init self from stream STRM
        """

        self.lines = []
        prev_line = None

        for line in strm:
            line = PythonLine(line, trace_level)

            if prev_line and prev_line.isIncomplete():
                prev_line.append(line.text)

            else:
                self.lines.append(line)
                prev_line = line

        self.n_lines = len(self.lines)

    def run(self):
        """
        Convert the Python text LINES to JavaScript syntax
        """

        self.promotePublicComments()
        self.processLines()

    def promotePublicComments(self):
        """
        Move public comments before method declarations
        """

        for i_line, line in enumerate(self.lines):
            next_line = self.nextLine(i_line, False)

            if (line.isClassDef() or line.isMethodDef()) and next_line.isComment():
                next_line.indent = next_line.indent.replace("    ", "", 1)
                self.lines[i_line] = next_line
                self.lines[i_line + 1] = line

    def processLines(self):
        """
        Convert the Python text LINES to JavaScript syntax
        """

        self.in_public_comment = False
        self.property_method = False
        self.super_name = None
        self.class_name = None
        self.class_properties = []
        self.active_blocks = []

        for i_line, line in enumerate(self.lines):
            line.trace(1, "PROCESSING")
            next_line = self.nextLine(i_line)

            # Case: Directive
            if line.text.startswith("@"):
                if line.text == "@handling_exceptions":
                    continue

                self.putLine(line.indent, "//", line.text)
                if line.text == "@property":
                    self.property_method = True
                continue

            # Case: Named import
            m = re.match("from\s+(\S+)\s+import\s+(\S+)", line.text)
            if m:
                module_path = m.groups(1)[0]
                class_names = m.groups(1)[1]

                if re.match("^\.\w", module_path):
                    module_path = "./" + self.jsFileNameFor(module_path[1:])

                elif module_path.startswith("myworldapp.modules.comms.server.api"):
                    module_path = "../api/" + self.jsFileNameFor(module_path[36:])

                elif module_path.startswith("myworldapp.modules.comms.server.base"):
                    module_path = "../base/" + self.jsFileNameFor(module_path[37:])

                elif module_path.startswith("myworldapp.core.server"):
                    module_path = "myWorld-native-services"
                    class_names = "{" + class_names + "}"

                text = "//import {} from '{}'".format(class_names, module_path)
                self.putLine(text)
                continue

            # Case: Unnamed Import
            if line.text.startswith("import "):
                self.putLine(line.indent, "//", line.text)
                continue

            # Case: Public comment
            if line.isPublicComment():

                # Case: One line public comment
                if not self.in_public_comment and not next_line.isPublicComment():
                    line.replace("##", "//", 1)
                    self.putLine(line.indent, line.text)
                    continue

                # Case: Start of public comment block
                if not self.in_public_comment:
                    self.in_public_comment = True
                    self.putLine(line.indent, "/**")
                    if line.text != "##":
                        line.replace("##", "*", 1)
                        self.putLine(line.indent, line.text)
                    continue

                # Case: End of public comment block
                if self.in_public_comment and not next_line.isPublicComment():
                    if line.text != "##":
                        line.replace("##", "*", 1)
                        self.putLine(line.indent, line.text)
                    self.putLine(line.indent, "*/")
                    self.in_public_comment = False
                    continue

                line.replace("##", "*", 1)
                self.putLine(line.indent, line.text)
                continue

            # Case: Private comment
            comment = line.isComment()
            if comment:
                line.replace("#", "//", 1)
                self.putLine(line.indent, line.text)
                continue

            # Class def
            m = line.isClassDef()
            if m:
                class_name = m.groups(1)[0]
                super_name = m.groups(1)[1]
                if not super_name or super_name == "object":
                    super_name = "myw.Class"

                decl = "const {} = {}.extend('{}',{{".format(class_name, super_name, class_name)
                self.putLine(line.indent, decl)
                self.active_blocks.append(line)

                self.class_name = class_name
                self.super_name = super_name
                continue

            # Apply code conversions (all statements and declarations)
            line.replaceToken("True", "true")
            line.replaceToken("False", "false")
            line.replaceToken("None", "undefined")
            line.replaceToken("__init__", "initialize")
            line.replaceToken("__str__", "toString")
            line.replaceToken("__contains__", "contains")
            line.text = re.sub(r"([^*])\*\*([^*])", r"\1...\2", line.text)  # Gather/scatter

            # Case: Method def
            m = line.isMethodDef()
            if m:
                meth_name = m.groups(1)[0]
                if self.property_method:
                    self.class_properties.append(meth_name)
                    meth_name = "_" + meth_name
                    self.property_method = False

                arg_list = m.groups(1)[1]
                arg_list = re.sub("\(\s*self,", "(", arg_list)
                arg_list = re.sub("\(\s*self\)", "()", arg_list)

                self.putLine(line.indent, meth_name, arg_list, " {")
                self.active_blocks.append(line)
                continue

            # Case: Class constant
            if self.active_blocks and self.active_blocks[-1].isClassDef():
                if "=" in line.text:
                    self.putLine(line.indent, line.text.replace("=", ":", 1), ",")
                    continue

            # Apply code conversions (statements only)
            line.trace(3, "STATEMENT")
            line.replaceToken("self", "this")  # Keywords & Operators
            line.replaceToken("and", "&&")
            line.replaceToken("or", "||")
            line.replaceToken("not", "!")
            line.replaceToken("is", "===")
            line.replaceToken("#", "//")
            line.replaceToken("raise", "throw")
            line.replaceKeyWordParams()

            line.replaceRegex(r"(\W)min\(", r"\1Math.min(")  # Functions
            line.replaceRegex(r"(\W)max\(", r"\1Math.max(")
            line.replaceRegex(r"(\W)len\(([\w\.]+)\)", r"\1\2.length")
            line.replaceRegex(r"lambda (\w*):(.*)", r"function (\1) {\2}")
            line.replaceRegex(r"\.get\(\s*(.*?)\s*,s*(.*?)\s*\)", r"[\1] || \2")
            line.replace("[::-1]", ".reversed()")
            line.replace(".append(", ".push(")
            line.replace("._urn(", ".getUrn(")
            line.replace("._descriptor.", ".featureDef.")
            line.replace(".feature_type", ".getType()", exclude=".feature_type =")
            line.replace("._title()", ".getTitle()")
            line.replace(".coords[0]", ".firstCoord()")
            line.replace(".coords[-1]", ".lastCoord()")

            if self.super_name:
                line.replaceRegex(
                    r"super\(\)\.(\w+)\(", self.super_name + r".prototype.\1.call(this,"
                )

            line.replaceRegex(r"(\W)([A-Z}]\w+)\(", r"\1 new \2(")  # Class instantiations

            line.replaceRegex(r"(\w+,\w+)(\s*=\s+)", r"[\1]\2")  # Multiple assignments
            line.replaceRegex(r"(\w+,\w+)(\s*in\s+)", r"[\1]\2")
            line.replaceRegex(r"\((\w+,\w+)\)(\s*=\s+)", r"[\1]\2")
            line.replaceRegex(r"\((\w+,\w+)\)(\s*in\s+)", r"[\1]\2")

            # TODO:
            # isinstance
            # in -> .includes()
            # .format -> ``
            # [::-1] -> reverse()
            # fromFeatureRec(), toFeatureRec()
            # if -> ?
            # ._primary_geom_field.geom() -> .geometry
            # .geoLength() -> .length()
            # .coords -> .coordinates

            # Case: Single line if statement
            m = re.match("if (.*)\:(.+)$", line.text)
            if m:
                clause = m.group(1)
                rem = m.group(2)
                line.text = "if ({}) {}".format(clause, rem)
                self.putLine(line.indent, line.text)
                continue

            # Case: If statement
            m = re.match("if (.*):$", line.text)
            if m:
                clause = m.group(1)
                line.text = "if ({}) {{".format(clause)
                self.putLine(line.indent, line.text)
                self.active_blocks.append(line)
                continue

            # Case: Elif statement
            m = re.match("elif (.*):$", line.text)
            if m:
                clause = m.group(1)
                line.text = "else if ({}) {{".format(clause)
                self.putLine(line.indent, line.text)
                self.active_blocks.append(line)
                continue

            # Case: Else statement
            m = re.match("else:$", line.text)
            if m:
                line.text = "else {"
                self.putLine(line.indent, line.text)
                self.active_blocks.append(line)
                continue

            # Case: For statement
            m = re.match("for (.*):$", line.text)
            if m:
                clause = m.group(1)
                clause = clause.replace(" in ", " of ")
                line.text = "for (const {}) {{".format(clause)
                self.putLine(line.indent, line.text)
                self.active_blocks.append(line)
                continue

            # Case: While statement
            m = re.match("while (.*):$", line.text)
            if m:
                clause = m.group(1)
                line.text = "while ({}) {{".format(clause)
                self.putLine(line.indent, line.text)
                self.active_blocks.append(line)
                continue

            # Case: Iterator yield
            if line.text.startswith("yield"):
                self.putLine(line.indent, "//", line.text)
                continue

            # Case: Assigment statement
            # Would require proper lex analysis
            # m = re.match(r'^[\w\d]+\s*=.*',line.text)
            # if m:
            #     line.text = 'const '+line.text

            # Case: Other
            self.putLine(line.indent, line.text)

            # Close block (if necessary)
            while self.active_blocks and next_line.level <= self.active_blocks[-1].level:
                block = self.active_blocks.pop()

                if block.isClassDef():
                    self.putLine(block.indent, "})")
                    self.putPropertyDefs()
                    self.putLine()
                    self.putLine("export default ", self.class_name)

                elif block.isMethodDef() and next_line.text:
                    self.putLine(block.indent, "},")
                else:
                    self.putLine(block.indent, "}")

    def nextLine(self, i_line, skip_blank=True):
        """
        Peek the next non-blank line after line I_LINE

        If none, returns a dummy line"""

        for i in range(i_line + 1, self.n_lines):
            line = self.lines[i]
            if skip_blank and line.text == "":
                continue
            return line

        return PythonLine("")

    def putPropertyDefs(self):
        """
        Output property definitions
        """

        for prop in self.class_properties:
            self.putLine()

            text = "Object.defineProperty({}.prototype, '{}', {{ get() {{ return this._{}(); }}}})".format(
                self.class_name, prop, prop
            )
            self.putLine(text)

        self.class_properties = []

    def putLine(self, *bits):
        """
        Output a line (with indent)
        """

        line = "".join(bits)
        print(line)

    def jsFileNameFor(self, file_name):
        """
        Build equivalent javascript file name for python file name 'file_name'
        """

        js_file_name = ""

        cap_next = True
        for i, ch in enumerate(file_name):

            if ch == "_":
                cap_next = True
                continue

            if cap_next:
                ch = ch.upper()

            js_file_name += ch
            cap_next = False

        return js_file_name


# ==============================================================================
#                                        PYTHONLINE
# ==============================================================================


class PythonLine:
    """
    A python statement
    """

    def __init__(self, line, trace_level=0):
        """
        Init slots of self
        """

        self.trace_level = trace_level

        line = line.rstrip()

        # Extract indent
        m = re.match("(\s*)(.*)", line)
        self.indent = m.groups(1)[0]
        self._text = m.groups(1)[1]

        # Extract trailing comment
        if not self.isComment():
            m = re.match(r"(.*)(#.*)", self.text)
            if m:
                self._text = m.groups(1)[0]
                self.comment = m.groups(1)[1]
            else:
                self.comment = ""

    def __str__(self):
        return "PythonLine({},text='{}',comment='{}')".format(self.level, self.text, self.comment)

    @property
    def text(self):
        return self._text

    @text.setter
    def text(self, value):
        orig_statement = self.text
        self._text = value

        if self.text != orig_statement:
            self.trace(2, "UPDATED")

    @property
    def level(self):
        return len(self.indent)

    def isIncomplete(self):
        if not self.text:
            return False
        if self.text.endswith("\\"):
            return True
        if self.text.endswith(","):
            return True
        if self.text.endswith(" and"):
            return True
        if self.text.endswith(" or"):
            return True
        return False

    def append(self, text):
        if self.text.endswith("\\"):
            self.text = self.text[:-1]
        self.text += " " + text

    def isPublicComment(self):
        return self.text.startswith("##") and not self.text.startswith("####")

    def isComment(self):
        return self.text.startswith("#")

    def isMethodDef(self):
        return re.match("def (.*)(\(.*\)):", self.text)

    def isClassDef(self):
        return re.match("class (.*)\((.*)\):", self.text)

    def replaceKeyWordParams(self):
        """
        Replace keyword parameters in function calls (to stop prettier treating them as assignments)
        """

        m = re.findall(r"\((.*)\)", self.text)
        if not m:
            return

        for arg_list in m:
            mm = re.findall(r"(\w[\w\d]*\s*=)[^\=]", arg_list)

            for kw_arg in mm:
                arg_name = kw_arg[:-1].strip()
                rep = "/*{}=*/".format(arg_name)
                self.replace(kw_arg, rep)

    def replace(self, old_str, new_str, count=-1, exclude=None):
        """
        Replace OLD_STR by NEW_STR
        """

        if exclude and re.match(exclude, self.text):
            return
        self.text = self.text.replace(old_str, new_str, count)

    def replaceToken(self, old_id, new_id):
        """
        Replace a method name or similar
        """
        old_re = r"(\W|^){}(\W|$)".format(self.escape(old_id))
        new_re = r"\1{}\2".format(new_id)

        self.replaceRegex(old_re, new_re)

    def replaceRegex(self, old_re, new_re, count=0):
        """
        Replace regexp OLD_RE by NEW_RE
        """
        self.trace(3, "REPLACING", old_re, "->", new_re)
        self.text = re.sub(old_re, new_re, self.text, count=count)

    def escape(self, str):
        """
        Escape string for use in regex
        """
        for ch in ".()":
            str = str.replace(ch, "\\" + ch)
        return str

    def trace(self, level, *items):
        """
        Print a debug message
        """

        if level <= self.trace_level:
            print(self.text, ":", *items)


# ==============================================================================
#                                        MAIN
# ==============================================================================


def arg(n, default):
    if len(sys.argv) <= n:
        return default
    return sys.argv[n]


trace_level = int(arg(1, "0"))

Converter(sys.stdin, trace_level).run()

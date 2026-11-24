"""2D presentation shapes for the .alp generator (text, rectangle, oval, line with x/y code)."""
from alp_xml import cd, nid, argb

def sh(name, x, y, xcode=None, ycode=None):
    xc = f"<XCode>{cd(xcode)}</XCode>\n" if xcode else ""
    yc = f"<YCode>{cd(ycode)}</YCode>\n" if ycode else ""
    return (f"<Id>{nid()}</Id>\n<Name>{cd(name)}</Name>\n<X>{x}</X><Y>{y}</Y>\n"
            f"<Label><X>0</X><Y>-10</Y></Label>\n<PublicFlag>true</PublicFlag>\n"
            f"<PresentationFlag>true</PresentationFlag>\n<ShowLabel>false</ShowLabel>\n"
            f"<DrawMode>SHAPE_DRAW_2D</DrawMode>\n{xc}{yc}<EmbeddedIcon>false</EmbeddedIcon>\n<Z>0</Z>\n")


_n = [0]


def nm(p):
    _n[0] += 1
    return f"{p}{_n[0]}"


def text(x, y, txt, code=None, color=argb(0, 0, 0), size=12, bold=False, align="LEFT", xcode=None, ycode=None):
    tc = f"<TextCode>{cd(code)}</TextCode>\n" if code else ""
    return f"""<Text>
{sh(nm("text"), x, y, xcode, ycode)}<Rotation>0.0</Rotation>
<Color>{color}</Color>
<Text>{cd(txt)}</Text>
{tc}<Font>
<Name>SansSerif</Name>
<Size>{size}</Size>
<Style>{1 if bold else 0}</Style>
</Font>
<Alignment>{align}</Alignment>
</Text>
"""


def rect(x, y, w, h, fill, line=None):
    lc = f"<LineColor>{line}</LineColor>" if line is not None else "<LineColor/>"
    return f"""<Rectangle>
{sh(nm("rect"), x, y)}<ZHeight>0</ZHeight>
<LineWidth>1</LineWidth>
{lc}
<LineMaterial>null</LineMaterial>
<LineStyle>SOLID</LineStyle>
<Width>{w}</Width>
<Height>{h}</Height>
<Rotation>0.0</Rotation>
<FillColor>{fill}</FillColor>
<FillMaterial>null</FillMaterial>
</Rectangle>
"""


def oval(x, y, r, fill, fill_code=None, xcode=None, ycode=None, line=argb(40, 40, 40)):
    fc = f"<FillColorCode>{cd(fill_code)}</FillColorCode>\n" if fill_code else ""
    return f"""<Oval>
{sh(nm("oval"), x, y, xcode, ycode)}<ZHeight>1</ZHeight>
<LineWidth>1</LineWidth>
<LineColor>{line}</LineColor>
<LineMaterial>null</LineMaterial>
<LineStyle>SOLID</LineStyle>
<RadiusX>{r}</RadiusX>
<RadiusY>{r}</RadiusY>
<Rotation>0.0</Rotation>
<FillColor>{fill}</FillColor>
{fc}<FillMaterial>null</FillMaterial>
</Oval>
"""


def line(x1, y1, x2, y2, color, width):
    return f"""<Polyline>
{sh(nm("walk"), x1, y1)}<ZHeight>0</ZHeight>
<LineWidth>{width}</LineWidth>
<LineColor>{color}</LineColor>
<LineMaterial>null</LineMaterial>
<LineStyle>SOLID</LineStyle>
<BeginArrowSize>1</BeginArrowSize>
<BeginArrowStyle>0</BeginArrowStyle>
<EndArrowSize>1</EndArrowSize>
<EndArrowStyle>0</EndArrowStyle>
<FillColor/>
<FillMaterial>null</FillMaterial>
<Points>
<Point><X>0</X><Y>0</Y><Z>0</Z></Point>
<Point><X>{round(x2 - x1, 1)}</X><Y>{round(y2 - y1, 1)}</Y><Z>0</Z></Point>
</Points>
<Closed>false</Closed>
</Polyline>
"""



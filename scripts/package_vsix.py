#!/usr/bin/env python3
"""Build a reproducible VSIX without npm, network access or a previous archive.

Usage: python3 scripts/package_vsix.py --output /volume/path/release.vsix
Creates release.vsix and release.vsix.sha256.json; refuses existing outputs.
Packages tracked extension runtime files only. Commit new runtime files first.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET
import zipfile


def digest(data):
    return hashlib.sha256(data).hexdigest()


def build(repo, output):
    root = repo / "vscode"
    meta = json.loads((root / "package.json").read_text())
    if meta.get("dependencies"):
        raise ValueError("Runtime npm dependencies require an explicit packaging design")
    tracked = subprocess.check_output(
        ["git", "-C", str(repo), "ls-files", "-z", "--", "vscode"]
    ).decode().split("\0")
    files = {}
    for name in sorted(filter(None, tracked)):
        rel = Path(name).relative_to("vscode")
        allowed = (
            str(rel) in {
                "package.json", "extension.js", "workspace.js",
                "README.md", "CHANGELOG.md", "PRIVACY.md",
            }
            or (rel.parts[0] == "lib" and rel.suffix == ".js")
            or (rel.parts[0] == "media" and rel.suffix in {".svg", ".png", ".jpg"})
        )
        if not allowed:
            continue
        source = repo / name
        if source.is_symlink() or not source.resolve().is_relative_to(root.resolve()):
            raise ValueError(f"Unsafe source: {name}")
        files["extension/" + rel.as_posix()] = source.read_bytes()
    for name in ["package.json", "extension.js", "workspace.js", "README.md",
                 "media/tvijo.svg"]:
        if "extension/" + name not in files:
            raise ValueError(f"Required tracked file missing: {name}")
    for container in meta.get("contributes", {}).get("viewsContainers", {}).values():
        for view in container:
            if "extension/" + view["icon"] not in files:
                raise ValueError("View icon missing from package")

    namespace = "http://schemas.microsoft.com/developer/vsx-schema/2011"
    ET.register_namespace("", namespace)
    def node(parent, tag, attributes=None, text=None):
        value = ET.SubElement(parent, f"{{{namespace}}}{tag}", attributes or {})
        value.text = text
        return value
    manifest = ET.Element(f"{{{namespace}}}PackageManifest", {"Version": "2.0.0"})
    metadata = node(manifest, "Metadata")
    node(metadata, "Identity", {
        "Language": "en-US", "Id": meta["name"], "Version": meta["version"],
        "Publisher": meta["publisher"],
    })
    node(metadata, "DisplayName", text=meta["displayName"])
    node(metadata, "Description", text=meta["description"])
    node(metadata, "Categories", text=",".join(meta.get("categories", [])))
    # Marketplace visibility is separate from package.json's npm private flag.
    flags = ["Public"] + (["Preview"] if meta.get("preview") else [])
    node(metadata, "GalleryFlags", text=" ".join(flags))
    properties = node(metadata, "Properties")
    for key, value in {
        "Microsoft.VisualStudio.Code.Engine": meta["engines"]["vscode"],
        "Microsoft.VisualStudio.Code.ExecutesCode": "true",
        "Microsoft.VisualStudio.Code.ExtensionKind": ",".join(meta.get("extensionKind", ["workspace"])),
    }.items():
        node(properties, "Property", {"Id": key, "Value": value})
    installation = node(manifest, "Installation")
    node(installation, "InstallationTarget", {"Id": "Microsoft.VisualStudio.Code"})
    node(manifest, "Dependencies")
    assets = node(manifest, "Assets")
    for kind, path in {
        "Microsoft.VisualStudio.Code.Manifest": "package.json",
        "Microsoft.VisualStudio.Services.Content.Details": "README.md",
        "Microsoft.VisualStudio.Services.Content.Changelog": "CHANGELOG.md",
    }.items():
        if "extension/" + path in files:
            node(assets, "Asset", {
                "Type": kind, "Path": "extension/" + path, "Addressable": "true",
            })
    files["extension.vsixmanifest"] = ET.tostring(manifest, encoding="utf-8", xml_declaration=True)
    types = ET.Element("Types", {
        "xmlns": "http://schemas.openxmlformats.org/package/2006/content-types",
    })
    for suffix, mime in {
        "js": "application/javascript", "json": "application/json",
        "md": "text/markdown", "svg": "image/svg+xml", "png": "image/png",
        "jpg": "image/jpeg", "vsixmanifest": "text/xml",
    }.items():
        ET.SubElement(types, "Default", {"Extension": suffix, "ContentType": mime})
    files["[Content_Types].xml"] = ET.tostring(types, encoding="utf-8", xml_declaration=True)
    receipt = output.with_name(output.name + ".sha256.json")
    if output.exists() or receipt.exists():
        raise FileExistsError("Output or hash manifest already exists")
    # ZIP_STORED avoids compression-library differences; source bytes and metadata
    # alone determine the archive. A filesystem timestamp never enters the build.
    with output.open("xb") as target:
        with zipfile.ZipFile(target, "w", compression=zipfile.ZIP_STORED) as archive:
            for name, data in sorted(files.items()):
                info = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
    result = {
        "version": meta["version"], "sha256": digest(output.read_bytes()),
        "files": {name: digest(data) for name, data in sorted(files.items())},
    }
    with receipt.open("x") as target:
        target.write(json.dumps(result, indent=2, sort_keys=True) + "\n")
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    result = build(Path(__file__).resolve().parents[1], args.output)
    print(json.dumps({"version": result["version"], "sha256": result["sha256"]}))

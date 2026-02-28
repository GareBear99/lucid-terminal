"""
3D Mesh Generation Plugin
Generates 3D meshes and textures from text prompts
Follows MeshyAI-style two-stage approach: preview (geometry) + refine (texture)
"""
import os
import math
import random
from typing import Optional, Tuple, Dict, List
from pathlib import Path

class MeshGenerator:
    """Integration with 3D mesh generation"""
    
    def __init__(self):
        self.config_dir = Path.home() / ".luciferai"
        self.output_dir = self.config_dir / "generated_meshes"
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.is_available = self._check_availability()
        
        # Simple keyword-based shape mapping for preview stage
        self.shape_keywords = {
            'chair': 'box_with_legs',
            'table': 'flat_box_with_legs',
            'sphere': 'sphere',
            'ball': 'sphere',
            'cube': 'cube',
            'box': 'cube',
            'cylinder': 'cylinder',
            'cone': 'cone',
            'pyramid': 'pyramid',
            'torus': 'torus',
            'ring': 'torus',
        }
    
    def _check_availability(self) -> bool:
        """Check if mesh generation is configured and accessible"""
        # Always available since we're using procedural generation
        return True
    
    def execute(self, query: str) -> Tuple[bool, str]:
        """
        Execute mesh generation query
        Returns: (success: bool, result: str)
        """
        if not self.is_available:
            return False, "Mesh generation not configured"
        
        try:
            # Parse query to extract prompt
            if query.startswith("mesh ") or query.startswith("3d "):
                prompt = query.split(None, 1)[1] if len(query.split()) > 1 else "cube"
            else:
                prompt = query
            
            # Two-stage generation: preview + refine
            preview_path, preview_msg = self._generate_preview(prompt)
            if not preview_path:
                return False, preview_msg
            
            refined_path, refine_msg = self._generate_refined(prompt, preview_path)
            if not refined_path:
                return False, refine_msg
            
            result = f"""✅ 3D Mesh Generated!

Preview mesh: {preview_path}
Refined mesh: {refined_path}

Prompt: "{prompt}"

Files saved to: {self.output_dir}

The meshes are in OBJ format and can be opened with:
- Blender (free)
- MeshLab (free)
- Any 3D modeling software
"""
            return True, result
            
        except Exception as e:
            return False, f"Mesh generation failed: {e}"
    
    def _generate_preview(self, prompt: str) -> Tuple[Optional[str], str]:
        """
        Stage 1: Generate base mesh with no texture (preview)
        This demonstrates the geometry generation phase
        """
        try:
            # Detect shape type from prompt
            shape_type = self._detect_shape_type(prompt)
            
            # Generate base mesh geometry
            vertices, faces = self._create_base_geometry(shape_type, prompt)
            
            # Save as OBJ file
            filename = self._sanitize_filename(prompt) + "_preview.obj"
            filepath = self.output_dir / filename
            
            self._save_obj_file(str(filepath), vertices, faces)
            
            return str(filepath), f"Preview mesh generated: {shape_type}"
            
        except Exception as e:
            return None, f"Preview generation failed: {e}"
    
    def _generate_refined(self, prompt: str, preview_path: str) -> Tuple[Optional[str], str]:
        """
        Stage 2: Apply texture to preview mesh (refine)
        This demonstrates the texturing phase
        """
        try:
            # In a real implementation, this would use diffusion models to generate textures
            # For now, we'll add material properties based on prompt keywords
            
            # Read preview mesh
            vertices, faces = self._read_obj_file(preview_path)
            
            # Generate texture/material based on prompt
            material = self._generate_material(prompt)
            
            # Save refined mesh with material
            filename = self._sanitize_filename(prompt) + "_refined.obj"
            filepath = self.output_dir / filename
            
            # Save with material file
            self._save_obj_with_material(str(filepath), vertices, faces, material, prompt)
            
            return str(filepath), "Refined mesh with texture generated"
            
        except Exception as e:
            return None, f"Refine generation failed: {e}"
    
    def _detect_shape_type(self, prompt: str) -> str:
        """Detect base shape from text prompt"""
        prompt_lower = prompt.lower()
        
        for keyword, shape in self.shape_keywords.items():
            if keyword in prompt_lower:
                return shape
        
        # Default to cube if no match
        return 'cube'
    
    def _create_base_geometry(self, shape_type: str, prompt: str) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
        """Create base geometry for given shape type"""
        
        if shape_type == 'cube':
            return self._create_cube()
        elif shape_type == 'sphere':
            return self._create_sphere()
        elif shape_type == 'cylinder':
            return self._create_cylinder()
        elif shape_type == 'cone':
            return self._create_cone()
        elif shape_type == 'pyramid':
            return self._create_pyramid()
        elif shape_type == 'torus':
            return self._create_torus()
        elif shape_type == 'box_with_legs':
            return self._create_chair()
        elif shape_type == 'flat_box_with_legs':
            return self._create_table()
        else:
            return self._create_cube()
    
    def _create_cube(self) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
        """Create a cube mesh"""
        vertices = [
            (-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),  # Front face
            (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1)       # Back face
        ]
        
        faces = [
            (1, 2, 3), (1, 3, 4),  # Front
            (5, 6, 7), (5, 7, 8),  # Back
            (1, 5, 6), (1, 6, 2),  # Bottom
            (4, 8, 7), (4, 7, 3),  # Top
            (1, 4, 8), (1, 8, 5),  # Left
            (2, 3, 7), (2, 7, 6),  # Right
        ]
        
        return vertices, faces
    
    def _create_sphere(self, resolution: int = 20) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
        """Create a sphere mesh using UV sphere algorithm"""
        vertices = []
        faces = []
        
        # Generate vertices
        for i in range(resolution + 1):
            theta = (i / resolution) * math.pi
            for j in range(resolution * 2):
                phi = (j / (resolution * 2)) * 2 * math.pi
                x = math.sin(theta) * math.cos(phi)
                y = math.cos(theta)
                z = math.sin(theta) * math.sin(phi)
                vertices.append((x, y, z))
        
        # Generate faces
        for i in range(resolution):
            for j in range(resolution * 2):
                v1 = i * (resolution * 2) + j
                v2 = v1 + resolution * 2
                v3 = v2 + 1 if (j + 1) < resolution * 2 else v2 + 1 - resolution * 2
                v4 = v1 + 1 if (j + 1) < resolution * 2 else v1 + 1 - resolution * 2
                
                if i > 0:
                    faces.append((v1 + 1, v2 + 1, v3 + 1))
                if i < resolution - 1:
                    faces.append((v1 + 1, v3 + 1, v4 + 1))
        
        return vertices, faces
    
    def _create_cylinder(self) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
        """Create a cylinder mesh"""
        vertices = []
        faces = []
        segments = 20
        height = 2.0
        radius = 1.0
        
        # Bottom circle
        for i in range(segments):
            angle = (i / segments) * 2 * math.pi
            x = radius * math.cos(angle)
            z = radius * math.sin(angle)
            vertices.append((x, -height/2, z))
        
        # Top circle
        for i in range(segments):
            angle = (i / segments) * 2 * math.pi
            x = radius * math.cos(angle)
            z = radius * math.sin(angle)
            vertices.append((x, height/2, z))
        
        # Side faces
        for i in range(segments):
            next_i = (i + 1) % segments
            v1 = i + 1
            v2 = next_i + 1
            v3 = next_i + segments + 1
            v4 = i + segments + 1
            faces.append((v1, v2, v3))
            faces.append((v1, v3, v4))
        
        return vertices, faces
    
    def _create_cone(self) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
        """Create a cone mesh"""
        vertices = [(0, 1, 0)]  # Apex
        faces = []
        segments = 20
        
        # Base circle
        for i in range(segments):
            angle = (i / segments) * 2 * math.pi
            x = math.cos(angle)
            z = math.sin(angle)
            vertices.append((x, -1, z))
        
        # Side faces
        for i in range(segments):
            next_i = (i + 1) % segments
            faces.append((1, i + 2, next_i + 2))
        
        return vertices, faces
    
    def _create_pyramid(self) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
        """Create a pyramid mesh"""
        vertices = [
            (0, 1, 0),             # Apex
            (-1, -1, -1),          # Base corners
            (1, -1, -1),
            (1, -1, 1),
            (-1, -1, 1)
        ]
        
        faces = [
            (1, 2, 3),  # Side 1
            (1, 3, 4),  # Side 2
            (1, 4, 5),  # Side 3
            (1, 5, 2),  # Side 4
            (2, 4, 3),  # Base 1
            (2, 5, 4),  # Base 2
        ]
        
        return vertices, faces
    
    def _create_torus(self) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
        """Create a torus mesh"""
        vertices = []
        faces = []
        major_radius = 1.0
        minor_radius = 0.3
        major_segments = 30
        minor_segments = 15
        
        for i in range(major_segments):
            theta = (i / major_segments) * 2 * math.pi
            for j in range(minor_segments):
                phi = (j / minor_segments) * 2 * math.pi
                x = (major_radius + minor_radius * math.cos(phi)) * math.cos(theta)
                y = minor_radius * math.sin(phi)
                z = (major_radius + minor_radius * math.cos(phi)) * math.sin(theta)
                vertices.append((x, y, z))
        
        for i in range(major_segments):
            for j in range(minor_segments):
                v1 = i * minor_segments + j
                v2 = v1 + 1 if (j + 1) < minor_segments else i * minor_segments
                v3 = ((i + 1) % major_segments) * minor_segments + j
                v4 = v3 + 1 if (j + 1) < minor_segments else ((i + 1) % major_segments) * minor_segments
                
                faces.append((v1 + 1, v2 + 1, v4 + 1))
                faces.append((v1 + 1, v4 + 1, v3 + 1))
        
        return vertices, faces
    
    def _create_chair(self) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
        """Create a simple chair mesh"""
        vertices = []
        faces = []
        
        # Seat (flat box)
        seat_vertices = [
            (-1, 0, -1), (1, 0, -1), (1, 0, 1), (-1, 0, 1),    # Top
            (-1, -0.2, -1), (1, -0.2, -1), (1, -0.2, 1), (-1, -0.2, 1)  # Bottom
        ]
        vertices.extend(seat_vertices)
        
        # Seat faces
        faces.extend([
            (1, 2, 3), (1, 3, 4),   # Top
            (5, 6, 7), (5, 7, 8),   # Bottom
            (1, 5, 6), (1, 6, 2),   # Sides
            (2, 6, 7), (2, 7, 3),
            (3, 7, 8), (3, 8, 4),
            (4, 8, 5), (4, 5, 1),
        ])
        
        # 4 legs
        leg_positions = [(-0.8, -1.5, -0.8), (0.8, -1.5, -0.8), (0.8, -1.5, 0.8), (-0.8, -1.5, 0.8)]
        for pos in leg_positions:
            base_idx = len(vertices)
            # Simple cylinder for leg
            for i in range(8):
                angle = (i / 8) * 2 * math.pi
                x = pos[0] + 0.1 * math.cos(angle)
                z = pos[2] + 0.1 * math.sin(angle)
                vertices.append((x, -0.2, z))
                vertices.append((x, pos[1], z))
            
            # Add leg faces
            for i in range(8):
                next_i = (i + 1) % 8
                v1 = base_idx + i * 2 + 1
                v2 = base_idx + next_i * 2 + 1
                v3 = base_idx + next_i * 2 + 2
                v4 = base_idx + i * 2 + 2
                faces.append((v1, v2, v3))
                faces.append((v1, v3, v4))
        
        # Backrest
        back_base = len(vertices)
        back_vertices = [
            (-1, 0, 1), (1, 0, 1), (1, 2, 1), (-1, 2, 1),    # Front
            (-1, 0, 0.8), (1, 0, 0.8), (1, 2, 0.8), (-1, 2, 0.8)  # Back
        ]
        vertices.extend(back_vertices)
        
        # Backrest faces
        offset = back_base + 1
        faces.extend([
            (offset, offset+1, offset+2), (offset, offset+2, offset+3),
            (offset+4, offset+5, offset+6), (offset+4, offset+6, offset+7),
            (offset, offset+4, offset+5), (offset, offset+5, offset+1),
            (offset+1, offset+5, offset+6), (offset+1, offset+6, offset+2),
            (offset+2, offset+6, offset+7), (offset+2, offset+7, offset+3),
            (offset+3, offset+7, offset+4), (offset+3, offset+4, offset),
        ])
        
        return vertices, faces
    
    def _create_table(self) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
        """Create a simple table mesh"""
        vertices = []
        faces = []
        
        # Tabletop (flat box)
        top_vertices = [
            (-2, 1, -1.5), (2, 1, -1.5), (2, 1, 1.5), (-2, 1, 1.5),    # Top
            (-2, 0.9, -1.5), (2, 0.9, -1.5), (2, 0.9, 1.5), (-2, 0.9, 1.5)  # Bottom
        ]
        vertices.extend(top_vertices)
        
        # Top faces
        faces.extend([
            (1, 2, 3), (1, 3, 4),
            (5, 6, 7), (5, 7, 8),
            (1, 5, 6), (1, 6, 2),
            (2, 6, 7), (2, 7, 3),
            (3, 7, 8), (3, 8, 4),
            (4, 8, 5), (4, 5, 1),
        ])
        
        # 4 legs
        leg_positions = [(-1.8, -1, -1.3), (1.8, -1, -1.3), (1.8, -1, 1.3), (-1.8, -1, 1.3)]
        for pos in leg_positions:
            base_idx = len(vertices)
            # Simple box for leg
            leg_verts = [
                (pos[0]-0.1, 0.9, pos[2]-0.1), (pos[0]+0.1, 0.9, pos[2]-0.1),
                (pos[0]+0.1, 0.9, pos[2]+0.1), (pos[0]-0.1, 0.9, pos[2]+0.1),
                (pos[0]-0.1, pos[1], pos[2]-0.1), (pos[0]+0.1, pos[1], pos[2]-0.1),
                (pos[0]+0.1, pos[1], pos[2]+0.1), (pos[0]-0.1, pos[1], pos[2]+0.1)
            ]
            vertices.extend(leg_verts)
            
            offset = base_idx + 1
            faces.extend([
                (offset, offset+1, offset+2), (offset, offset+2, offset+3),
                (offset+4, offset+5, offset+6), (offset+4, offset+6, offset+7),
                (offset, offset+4, offset+5), (offset, offset+5, offset+1),
                (offset+1, offset+5, offset+6), (offset+1, offset+6, offset+2),
                (offset+2, offset+6, offset+7), (offset+2, offset+7, offset+3),
                (offset+3, offset+7, offset+4), (offset+3, offset+4, offset),
            ])
        
        return vertices, faces
    
    def _generate_material(self, prompt: str) -> Dict:
        """Generate material properties based on prompt"""
        prompt_lower = prompt.lower()
        
        # Detect material keywords
        if 'wood' in prompt_lower or 'wooden' in prompt_lower or 'chair' in prompt_lower or 'table' in prompt_lower:
            return {'Ka': (0.6, 0.4, 0.2), 'Kd': (0.6, 0.4, 0.2), 'Ks': (0.1, 0.1, 0.1), 'Ns': 10}
        elif 'metal' in prompt_lower or 'steel' in prompt_lower or 'iron' in prompt_lower:
            return {'Ka': (0.7, 0.7, 0.7), 'Kd': (0.8, 0.8, 0.8), 'Ks': (0.9, 0.9, 0.9), 'Ns': 100}
        elif 'gold' in prompt_lower or 'golden' in prompt_lower:
            return {'Ka': (1.0, 0.8, 0.0), 'Kd': (1.0, 0.8, 0.0), 'Ks': (1.0, 1.0, 0.5), 'Ns': 80}
        elif 'glass' in prompt_lower or 'crystal' in prompt_lower:
            return {'Ka': (0.9, 0.9, 1.0), 'Kd': (0.9, 0.9, 1.0), 'Ks': (1.0, 1.0, 1.0), 'Ns': 200}
        elif 'red' in prompt_lower:
            return {'Ka': (0.8, 0.1, 0.1), 'Kd': (0.8, 0.1, 0.1), 'Ks': (0.5, 0.5, 0.5), 'Ns': 50}
        elif 'blue' in prompt_lower:
            return {'Ka': (0.1, 0.1, 0.8), 'Kd': (0.1, 0.1, 0.8), 'Ks': (0.5, 0.5, 0.5), 'Ns': 50}
        elif 'green' in prompt_lower:
            return {'Ka': (0.1, 0.8, 0.1), 'Kd': (0.1, 0.8, 0.1), 'Ks': (0.5, 0.5, 0.5), 'Ns': 50}
        else:
            # Default gray material
            return {'Ka': (0.5, 0.5, 0.5), 'Kd': (0.5, 0.5, 0.5), 'Ks': (0.7, 0.7, 0.7), 'Ns': 50}
    
    def _save_obj_file(self, filepath: str, vertices: List[Tuple[float, float, float]], faces: List[Tuple[int, int, int]]):
        """Save mesh as OBJ file"""
        with open(filepath, 'w') as f:
            f.write("# Generated by LuciferAI Mesh Generator\n")
            f.write(f"# Vertices: {len(vertices)}\n")
            f.write(f"# Faces: {len(faces)}\n\n")
            
            # Write vertices
            for v in vertices:
                f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
            
            f.write("\n")
            
            # Write faces
            for face in faces:
                f.write(f"f {face[0]} {face[1]} {face[2]}\n")
    
    def _save_obj_with_material(self, filepath: str, vertices: List[Tuple[float, float, float]], 
                                 faces: List[Tuple[int, int, int]], material: Dict, prompt: str):
        """Save mesh as OBJ file with MTL material"""
        # Save OBJ file
        mtl_filename = Path(filepath).stem + ".mtl"
        
        with open(filepath, 'w') as f:
            f.write("# Generated by LuciferAI Mesh Generator\n")
            f.write(f"# Prompt: {prompt}\n")
            f.write(f"# Vertices: {len(vertices)}\n")
            f.write(f"# Faces: {len(faces)}\n")
            f.write(f"mtllib {mtl_filename}\n\n")
            
            # Write vertices
            for v in vertices:
                f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
            
            f.write("\n")
            f.write(f"usemtl material_0\n")
            
            # Write faces
            for face in faces:
                f.write(f"f {face[0]} {face[1]} {face[2]}\n")
        
        # Save MTL file
        mtl_path = Path(filepath).parent / mtl_filename
        with open(mtl_path, 'w') as f:
            f.write("# Generated by LuciferAI Mesh Generator\n")
            f.write(f"# Prompt: {prompt}\n\n")
            f.write("newmtl material_0\n")
            f.write(f"Ka {material['Ka'][0]} {material['Ka'][1]} {material['Ka'][2]}\n")
            f.write(f"Kd {material['Kd'][0]} {material['Kd'][1]} {material['Kd'][2]}\n")
            f.write(f"Ks {material['Ks'][0]} {material['Ks'][1]} {material['Ks'][2]}\n")
            f.write(f"Ns {material['Ns']}\n")
    
    def _read_obj_file(self, filepath: str) -> Tuple[List[Tuple[float, float, float]], List[Tuple[int, int, int]]]:
        """Read mesh from OBJ file"""
        vertices = []
        faces = []
        
        with open(filepath, 'r') as f:
            for line in f:
                if line.startswith('v '):
                    parts = line.split()
                    vertices.append((float(parts[1]), float(parts[2]), float(parts[3])))
                elif line.startswith('f '):
                    parts = line.split()
                    # Handle face indices (1-indexed)
                    face = tuple(int(p.split('/')[0]) for p in parts[1:4])
                    faces.append(face)
        
        return vertices, faces
    
    def _sanitize_filename(self, text: str) -> str:
        """Convert text to safe filename"""
        # Keep only alphanumeric and spaces
        safe = ''.join(c if c.isalnum() or c.isspace() else '_' for c in text)
        # Replace spaces with underscores and limit length
        safe = safe.replace(' ', '_')[:50]
        return safe.lower()
